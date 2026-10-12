from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import UPLOAD_DIR, MASK_DIR
from app.db.database import get_db
from app.db.models import Scan
from app.services.unet import segmenter
from app.services.localization import get_localization_metrics
from app.services.comparison import compare_localizations


router = APIRouter(
    prefix="/compare",
    tags=["Comparison"],
)


# ---------------------------------------------------------
# Helper: save uploaded image
# ---------------------------------------------------------

async def save_uploaded_image(upload: UploadFile) -> Path:
    """
    Save the current uploaded image into backend/storage/uploads.
    """

    if not upload.filename:
        raise HTTPException(
            status_code=400,
            detail="No image filename was provided.",
        )

    allowed_types = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
    }

    if upload.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Please upload a JPG, JPEG, PNG, or WEBP image.",
        )

    extension = Path(upload.filename).suffix.lower()

    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        extension = ".jpg"

    filename = f"{uuid4().hex}{extension}"

    output_path = UPLOAD_DIR / filename

    contents = await upload.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    output_path.write_bytes(contents)

    return output_path


# ---------------------------------------------------------
# Helper: load a saved U-Net mask
# ---------------------------------------------------------

def load_saved_mask(mask_path: str):
    """
    Load a previously saved binary U-Net mask.
    """

    if not mask_path:
        return None

    path = Path(mask_path)

    if not path.exists():
        return None

    mask = cv2.imread(
        str(path),
        cv2.IMREAD_GRAYSCALE,
    )

    if mask is None:
        return None

    # Convert saved 0-255 mask back to 0-1 binary mask
    mask = (mask > 127).astype(np.uint8)

    return mask


# ---------------------------------------------------------
# Helper: run U-Net and save mask
# ---------------------------------------------------------

def run_unet_and_save_mask(
    image_path: Path,
    scan_id: int | None = None,
):
    """
    Run the exact U-Net inference pipeline supplied by the user:

        BGR image
        -> RGB
        -> resize to IMG_SIZE
        -> /255 normalization
        -> U-Net
        -> probability mask
        -> threshold > 0.5
        -> binary mask

    Returns:
        binary_mask
        metrics
        saved_mask_path
    """

    if not segmenter.loaded or segmenter.model is None:
        raise HTTPException(
            status_code=503,
            detail="U-Net model is not loaded.",
        )

    # -----------------------------------------------------
    # This follows the supplied analyze_skin_lesion()
    # preprocessing.
    # -----------------------------------------------------

    img = cv2.imread(str(image_path))

    if img is None:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read image: {image_path.name}",
        )

    img_rgb = cv2.cvtColor(
        img,
        cv2.COLOR_BGR2RGB,
    )

    # Use the same IMG_SIZE preprocessing as unet.py
    from app.core.config import IMG_SIZE

    img_resized = cv2.resize(
        img_rgb,
        (IMG_SIZE, IMG_SIZE),
    )

    # Exact normalization from user's U-Net code
    seg_input = np.expand_dims(
        img_resized.astype(np.float32) / 255.0,
        axis=0,
    )

    # Exact U-Net prediction behavior
    pred_mask_prob = segmenter.model.predict(
        seg_input,
        verbose=0,
    )[0, ..., 0]

    # Exact threshold from user's code
    pred_mask_bin = (
        pred_mask_prob > 0.5
    ).astype(np.uint8)

    # -----------------------------------------------------
    # Calculate localization information
    # -----------------------------------------------------

    metrics = get_localization_metrics(
        pred_mask_bin
    )

    # -----------------------------------------------------
    # Save binary mask
    # -----------------------------------------------------

    if scan_id is not None:
        mask_filename = f"scan_{scan_id}_mask.png"
    else:
        mask_filename = f"compare_{uuid4().hex}_mask.png"

    mask_path = MASK_DIR / mask_filename

    mask_image = (
        pred_mask_bin.astype(np.uint8) * 255
    )

    success = cv2.imwrite(
        str(mask_path),
        mask_image,
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to save U-Net mask.",
        )

    return (
        pred_mask_bin,
        metrics,
        mask_path,
    )


# ---------------------------------------------------------
# Helper: make frontend URL
# ---------------------------------------------------------

def storage_url(path: Path) -> str:
    """
    Convert:

        storage/masks/scan_1_mask.png

    into:

        /storage/masks/scan_1_mask.png
    """

    path = path.resolve()

    parts = path.parts

    try:
        storage_index = parts.index("storage")
    except ValueError:
        return ""

    relative_parts = parts[storage_index:]

    return "/" + "/".join(relative_parts)


# ---------------------------------------------------------
# POST /api/compare
# ---------------------------------------------------------

@router.post("")
async def compare_images(
    previous_scan_id: int = Form(...),
    current_image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Compare a previous scan with a newly uploaded image.

    Workflow:

        Previous Scan
             |
             v
        Previous U-Net mask
             |
             v
        Previous metrics
             |
             |
             +----------------------+
                                    |
        Current uploaded image      |
             |                      |
             v                      |
        Current U-Net               |
             |                      |
             v                      |
        Current mask                |
             |                      |
             v                      |
        Current metrics             |
             |                      |
             +----------+-----------+
                        |
                        v
                comparison.py
                        |
                        v
                 JSON response
    """

    # -----------------------------------------------------
    # 1. Find previous scan
    # -----------------------------------------------------

    previous_scan = (
        db.query(Scan)
        .filter(Scan.id == previous_scan_id)
        .first()
    )

    if previous_scan is None:
        raise HTTPException(
            status_code=404,
            detail=f"Previous scan {previous_scan_id} was not found.",
        )

    # -----------------------------------------------------
    # 2. Verify previous image exists
    # -----------------------------------------------------

    previous_image_path = Path(
        previous_scan.image_path
    )

    if not previous_image_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Previous scan image could not be found.",
        )

    # -----------------------------------------------------
    # 3. Get previous U-Net mask
    #
    # If it already exists, reuse it.
    #
    # If it does not exist, run U-Net again on the
    # previous image.
    # -----------------------------------------------------

    previous_mask = None

    if previous_scan.mask_path:
        previous_mask = load_saved_mask(
            previous_scan.mask_path
        )

    if previous_mask is None:

        (
            previous_mask,
            previous_metrics,
            previous_mask_path,
        ) = run_unet_and_save_mask(
            previous_image_path,
            scan_id=previous_scan.id,
        )

        # Save previous localization data
        previous_scan.mask_path = str(
            previous_mask_path
        )

        previous_scan.area_pixels = (
            previous_metrics["areaPixels"]
        )

        previous_scan.perimeter_pixels = (
            previous_metrics["perimeterPixels"]
        )

        if previous_metrics["bbox"]:

            bbox = previous_metrics["bbox"]

            previous_scan.bbox_x = bbox["x"]
            previous_scan.bbox_y = bbox["y"]
            previous_scan.bbox_width = bbox["width"]
            previous_scan.bbox_height = bbox["height"]

        db.commit()

    else:

        # Existing mask found, calculate metrics from it.
        previous_metrics = get_localization_metrics(
            previous_mask
        )

    # -----------------------------------------------------
    # 4. Upload current image
    # -----------------------------------------------------

    current_image_path = await save_uploaded_image(
        current_image
    )

    # -----------------------------------------------------
    # 5. Create current Scan database record
    #
    # Classification is intentionally left NULL here.
    # Verify is based on U-Net localization comparison.
    # -----------------------------------------------------

    current_scan = Scan(
        file_name=current_image.filename,
        image_path=str(current_image_path),
    )

    db.add(current_scan)
    db.commit()
    db.refresh(current_scan)

    # -----------------------------------------------------
    # 6. Run U-Net on current image
    # -----------------------------------------------------

    try:

        (
            current_mask,
            current_metrics,
            current_mask_path,
        ) = run_unet_and_save_mask(
            current_image_path,
            scan_id=current_scan.id,
        )

    except Exception:
        # Remove database record if U-Net processing fails
        db.delete(current_scan)
        db.commit()

        raise

    # -----------------------------------------------------
    # 7. Save current localization information
    # -----------------------------------------------------

    current_scan.mask_path = str(
        current_mask_path
    )

    current_scan.area_pixels = (
        current_metrics["areaPixels"]
    )

    current_scan.perimeter_pixels = (
        current_metrics["perimeterPixels"]
    )

    if current_metrics["bbox"]:

        bbox = current_metrics["bbox"]

        current_scan.bbox_x = bbox["x"]
        current_scan.bbox_y = bbox["y"]
        current_scan.bbox_width = bbox["width"]
        current_scan.bbox_height = bbox["height"]

    db.commit()
    db.refresh(current_scan)

    # -----------------------------------------------------
    # 8. Compare the two U-Net localization results
    # -----------------------------------------------------

    comparison = compare_localizations(
        previous_metrics=previous_metrics,
        current_metrics=current_metrics,
        previous_mask=previous_mask,
        current_mask=current_mask,
    )

    # -----------------------------------------------------
    # 9. Build response for VerifyView
    # -----------------------------------------------------

    previous_bbox = previous_metrics.get(
        "bbox"
    )

    current_bbox = current_metrics.get(
        "bbox"
    )

    previous_image_url = storage_url(
        previous_image_path
    )

    current_image_url = storage_url(
        current_image_path
    )

    previous_mask_url = storage_url(
        Path(previous_scan.mask_path)
    )

    current_mask_url = storage_url(
        current_mask_path
    )

    return {
        "previous": {
            "scanId": previous_scan.id,

            "fileName": previous_scan.file_name,

            "imageUrl": previous_image_url,

            "areaPixels": previous_metrics[
                "areaPixels"
            ],

            "areaAffectedPercent": previous_metrics[
                "areaAffectedPercent"
            ],

            "perimeterPixels": previous_metrics[
                "perimeterPixels"
            ],

            "bbox": previous_bbox,

            "maskUrl": previous_mask_url,
        },

        "current": {
            "scanId": current_scan.id,

            "fileName": current_scan.file_name,

            "imageUrl": current_image_url,

            "areaPixels": current_metrics[
                "areaPixels"
            ],

            "areaAffectedPercent": current_metrics[
                "areaAffectedPercent"
            ],

            "perimeterPixels": current_metrics[
                "perimeterPixels"
            ],

            "bbox": current_bbox,

            "maskUrl": current_mask_url,
        },

        "comparison": {
            "areaChangePercent": comparison[
                "areaChangePercent"
            ],

            "widthChangePercent": comparison[
                "widthChangePercent"
            ],

            "heightChangePercent": comparison[
                "heightChangePercent"
            ],

            "perimeterChangePercent": comparison[
                "perimeterChangePercent"
            ],

            "iou": comparison[
                "iou"
            ],
        },

        "message": (
            "Comparison completed using U-Net "
            "localization for both images."
        ),
    }
