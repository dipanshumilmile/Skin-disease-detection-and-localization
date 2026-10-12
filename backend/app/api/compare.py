
import os
import uuid
from pathlib import Path

import cv2
import numpy as np

from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Scan

from app.core.config import UPLOAD_DIR, MASK_DIR

from app.services.classifier import classifier
from app.services.segmenter import segmenter
from app.services.localization import get_localization_metrics


router = APIRouter(
    prefix="/compare",
    tags=["Comparison"],
)

# Reuse the same storage directories as analyze.py.
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MASK_DIR.mkdir(parents=True, exist_ok=True)


def storage_url(relative_path):
    """Convert a stored relative path into a public storage URL."""
    if not relative_path:
        return None

    normalized = str(relative_path).replace("\\", "/").lstrip("/")

    # Analyze.py stores image paths such as storage/uploads/file.jpg.
    if normalized.startswith("storage/"):
        normalized = normalized[len("storage/"):]

    return f"/storage/{normalized}"


def get_bbox(scan):
    """Return a scan's bounding box in the frontend's expected format."""
    if (
        scan.bbox_x is None
        or scan.bbox_y is None
        or scan.bbox_width is None
        or scan.bbox_height is None
    ):
        return None

    return {
        "x": scan.bbox_x,
        "y": scan.bbox_y,
        "width": scan.bbox_width,
        "height": scan.bbox_height,
    }


def get_scan_image(scan):
    return {
        "scanId": scan.id,
        "fileName": scan.file_name,
        "imageUrl": storage_url(scan.image_path),
        "areaPixels": scan.area_pixels,
        "perimeterPixels": scan.perimeter_pixels,
        "bbox": get_bbox(scan),
        "maskUrl": storage_url(scan.mask_path),
    }


def percent_change(previous, current):
    """Calculate percentage change relative to the previous measurement."""
    if previous is None or current is None:
        return None

    if previous == 0:
        return 0.0 if current == 0 else None

    return round(((current - previous) / abs(previous)) * 100, 2)


def calculate_iou(previous_mask_path, current_mask_path):
    """Calculate intersection over union from the two saved binary masks."""
    if not previous_mask_path or not current_mask_path:
        return None

    previous_mask = cv2.imread(
        str(previous_mask_path),
        cv2.IMREAD_GRAYSCALE,
    )
    current_mask = cv2.imread(
        str(current_mask_path),
        cv2.IMREAD_GRAYSCALE,
    )

    if previous_mask is None or current_mask is None:
        return None

    # U-Net masks should normally have matching dimensions.
    # Resize only if a saved mask has a different resolution.
    if previous_mask.shape != current_mask.shape:
        previous_mask = cv2.resize(
            previous_mask,
            (current_mask.shape[1], current_mask.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        )

    previous_binary = previous_mask > 0
    current_binary = current_mask > 0

    intersection = np.logical_and(
        previous_binary,
        current_binary,
    ).sum()

    union = np.logical_or(
        previous_binary,
        current_binary,
    ).sum()

    if union == 0:
        return None

    return round(float(intersection / union), 4)


@router.post("")
async def compare_scan(
    previous_scan_id: int = Form(...),
    current_image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # ---------------------------------------------------------
    # 1. Find the previous scan
    # ---------------------------------------------------------
    previous = (
        db.query(Scan)
        .filter(Scan.id == previous_scan_id)
        .first()
    )

    if previous is None:
        raise HTTPException(
            status_code=404,
            detail="Previous scan not found.",
        )

    # ---------------------------------------------------------
    # 2. Validate the uploaded image
    # ---------------------------------------------------------
    if (
        not current_image.content_type
        or not current_image.content_type.startswith("image/")
    ):
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image.",
        )

    extension = Path(current_image.filename or "").suffix.lower()

    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Supported formats are JPG, JPEG, PNG and WEBP.",
        )

    contents = await current_image.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    # Verify that the file is actually decodable as an image.
    decoded = cv2.imdecode(
        np.frombuffer(contents, dtype=np.uint8),
        cv2.IMREAD_COLOR,
    )

    if decoded is None:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be decoded as an image.",
        )

    unique_name = f"{uuid.uuid4()}{extension}"
    image_path = UPLOAD_DIR / unique_name

    with open(image_path, "wb") as file:
        file.write(contents)

    # ---------------------------------------------------------
    # 3. Classification, matching the Analyze pipeline
    # ---------------------------------------------------------
    try:
        classification = classifier.predict(image_path)
    except Exception as exc:
        image_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail=f"Classification failed: {exc}",
        )

    # ---------------------------------------------------------
    # 4. Create the database record to obtain a scan ID
    # ---------------------------------------------------------
    project_root = image_path.resolve().parents[2]

    scan = Scan(
        file_name=current_image.filename or unique_name,
        image_path=str(image_path.resolve().relative_to(project_root)),
        predicted_class=classification["class_name"],
        confidence=float(classification["confidence"]),
    )

    db.add(scan)
    db.commit()
    db.refresh(scan)

    # ---------------------------------------------------------
    # 5. Run the same U-Net used by Analyze
    # ---------------------------------------------------------
    try:
        if not segmenter.loaded:
            raise HTTPException(
                status_code=503,
                detail="The U-Net segmentation model is not loaded.",
            )

        segmentation = segmenter.predict(image_path)

        binary_mask = segmentation["binary_mask"]

        if binary_mask is None or binary_mask.size == 0:
            raise RuntimeError("U-Net returned an empty mask.")

        # Keep the same metric calculation as analyze.py.
        metrics = get_localization_metrics(binary_mask)
        bbox = metrics["bbox"]

        # -----------------------------------------------------
        # 6. Save the current scan's binary mask
        # -----------------------------------------------------
        mask_filename = f"{scan.id}_mask.png"
        current_mask_path = MASK_DIR / mask_filename

        mask_image = (
            (binary_mask > 0).astype(np.uint8) * 255
        )

        if not cv2.imwrite(str(current_mask_path), mask_image):
            raise RuntimeError("Could not save the current U-Net mask.")

        # -----------------------------------------------------
        # 7. Update database localization fields
        # -----------------------------------------------------
        scan.mask_path = f"masks/{mask_filename}"
        scan.area_pixels = float(metrics["areaPixels"])
        scan.perimeter_pixels = float(metrics["perimeterPixels"])

        if bbox is not None:
            scan.bbox_x = float(bbox["x"])
            scan.bbox_y = float(bbox["y"])
            scan.bbox_width = float(bbox["width"])
            scan.bbox_height = float(bbox["height"])

        db.commit()
        db.refresh(scan)

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Current-image segmentation failed: {exc}",
        )

    # ---------------------------------------------------------
    # 8. Resolve the previous saved mask on disk
    # ---------------------------------------------------------
    previous_mask_path = None

    if previous.mask_path:
        candidate = (
            MASK_DIR.parent / previous.mask_path
        ).resolve()

        mask_root = MASK_DIR.resolve()

        # Ensure the resolved path remains inside the mask directory.
        if candidate.is_relative_to(mask_root) and candidate.is_file():
            previous_mask_path = candidate

    # ---------------------------------------------------------
    # 9. Calculate comparison metrics
    # ---------------------------------------------------------
    previous_bbox = get_bbox(previous)
    current_bbox = get_bbox(scan)

    width_change = percent_change(
        previous.bbox_width,
        scan.bbox_width,
    )

    height_change = percent_change(
        previous.bbox_height,
        scan.bbox_height,
    )

    area_change = percent_change(
        previous.area_pixels,
        scan.area_pixels,
    )

    perimeter_change = percent_change(
        previous.perimeter_pixels,
        scan.perimeter_pixels,
    )

    iou = calculate_iou(
        previous_mask_path,
        MASK_DIR / f"{scan.id}_mask.png",
    )

    # ---------------------------------------------------------
    # 10. Return the response expected by VerifyView.jsx
    # ---------------------------------------------------------
    return {
        "status": "success",
        "previous": get_scan_image(previous),
        "current": get_scan_image(scan),
        "comparison": {
            "areaChangePercent": area_change,
            "widthChangePercent": width_change,
            "heightChangePercent": height_change,
            "perimeterChangePercent": perimeter_change,
            "iou": iou,
        },
        "message": "Scan comparison completed.",
    }
