import os
import uuid

import cv2
import numpy as np

from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Scan

from app.core.config import (
    UPLOAD_DIR,
    MASK_DIR,
)

from app.services.classifier import classifier
from app.services.gradcam import generate_gradcam
from app.services.segmenter import segmenter
from app.services.localization import get_localization_metrics


router = APIRouter(
    prefix="/analyze",
    tags=["Analyze"],
)


# =========================================================
# Helper: create directories for U-Net visualization
# =========================================================

SEGMENTED_DIR = MASK_DIR.parent / "segmented"
BBOX_DIR = MASK_DIR.parent / "bbox"

SEGMENTED_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

BBOX_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


# =========================================================
# POST /api/analyze
# =========================================================

@router.post("")
async def analyze_image(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    # =====================================================
    # Validate image
    # =====================================================

    if not image.content_type:
        raise HTTPException(
            status_code=400,
            detail="Invalid image.",
        )

    if not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file must be an image.",
        )

    # =====================================================
    # Save uploaded image
    # =====================================================

    extension = os.path.splitext(
        image.filename or ""
    )[1].lower()

    if not extension:
        extension = ".jpg"

    unique_name = (
        f"{uuid.uuid4()}{extension}"
    )

    image_path = (
        UPLOAD_DIR / unique_name
    )

    contents = await image.read()

    with open(
        image_path,
        "wb",
    ) as file:
        file.write(contents)

    # =====================================================
    # Classification
    # =====================================================

    try:

        classification = classifier.predict(
            image_path
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=f"Classification failed: {exc}",
        )

    # =====================================================
    # Save initial database record
    # =====================================================

    scan = Scan(
        file_name=(
            image.filename
            or unique_name
        ),

        image_path=str(
            image_path.relative_to(
                image_path.parents[2]
            )
        ),

        predicted_class=(
            classification[
                "class_name"
            ]
        ),

        confidence=(
            classification[
                "confidence"
            ]
        ),
    )

    db.add(scan)
    db.commit()
    db.refresh(scan)

    # =====================================================
    # Grad-CAM
    # =====================================================

    gradcam = None

    try:

        gradcam = generate_gradcam(
            classifier.model,
            image_path,
            f"{scan.id}_gradcam.jpg",
        )

        if gradcam:

            scan.gradcam_path = (
                f"gradcam/"
                f"{scan.id}_gradcam.jpg"
            )

    except Exception as exc:

        print(
            f"[GradCAM] Failed: {exc}"
        )

    # =====================================================
    # U-NET SEGMENTATION
    # =====================================================

    localization = None

    try:

        if not segmenter.loaded:

            print(
                "[U-Net] Model is not loaded. "
                "Skipping segmentation."
            )

        else:

            print(
                f"[U-Net] Running segmentation "
                f"for scan {scan.id}..."
            )

            # -------------------------------------------------
            # Run U-Net ONCE
            # -------------------------------------------------

            segmentation = segmenter.predict(
                image_path
            )

            # -------------------------------------------------
            # Get cleaned binary mask
            # -------------------------------------------------

            binary_mask = segmentation[
                "binary_mask"
            ]

            # -------------------------------------------------
            # Calculate localization metrics
            # -------------------------------------------------

            metrics = get_localization_metrics(
                binary_mask
            )

            # =================================================
            # 1. SAVE BINARY MASK
            # =================================================

            mask_filename = (
                f"{scan.id}_mask.png"
            )

            mask_path = (
                MASK_DIR / mask_filename
            )

            mask_image = (
                binary_mask * 255
            ).astype(
                np.uint8
            )

            mask_success = cv2.imwrite(
                str(mask_path),
                mask_image,
            )

            if not mask_success:

                raise RuntimeError(
                    "Failed to save U-Net mask."
                )

            # =================================================
            # 2. SAVE SEGMENTED LESION
            # =================================================

            segmented_filename = (
                f"{scan.id}_segmented.png"
            )

            segmented_path = (
                SEGMENTED_DIR
                /
                segmented_filename
            )

            segmented_image = (
                segmentation[
                    "segmented_image"
                ]
            )

            # Convert RGB → BGR for OpenCV
            segmented_bgr = cv2.cvtColor(
                segmented_image,
                cv2.COLOR_RGB2BGR,
            )

            segmented_success = cv2.imwrite(
                str(segmented_path),
                segmented_bgr,
            )

            if not segmented_success:

                raise RuntimeError(
                    "Failed to save segmented image."
                )

            # =================================================
            # 3. CREATE ORIGINAL + BOUNDING BOX
            # =================================================

            bbox = metrics["bbox"]

            bbox_filename = (
                f"{scan.id}_bbox.png"
            )

            bbox_path = (
                BBOX_DIR / bbox_filename
            )

            # U-Net works on 224x224 RGB image
            original_image = (
                segmentation["image"]
                .copy()
            )

            bbox_image = cv2.cvtColor(
                original_image,
                cv2.COLOR_RGB2BGR,
            )

            if bbox is not None:

                x = int(
                    bbox["x"]
                )

                y = int(
                    bbox["y"]
                )

                width = int(
                    bbox["width"]
                )

                height = int(
                    bbox["height"]
                )

                x2 = x + width
                y2 = y + height

                # -------------------------------------------------
                # Green bounding box
                # -------------------------------------------------

                cv2.rectangle(
                    bbox_image,
                    (x, y),
                    (x2, y2),
                    (0, 255, 0),
                    3,
                )

                # -------------------------------------------------
                # Label background
                # -------------------------------------------------

                label = "Lesion"

                (
                    label_width,
                    label_height,
                ), baseline = cv2.getTextSize(
                    label,
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    2,
                )

                label_x = x

                label_y = max(
                    y - 8,
                    label_height + 8,
                )

                cv2.rectangle(
                    bbox_image,
                    (
                        label_x,
                        label_y
                        - label_height
                        - 8,
                    ),
                    (
                        label_x
                        + label_width
                        + 8,
                        label_y
                        + baseline
                        - 4,
                    ),
                    (0, 255, 0),
                    -1,
                )

                # -------------------------------------------------
                # Label text
                # -------------------------------------------------

                cv2.putText(
                    bbox_image,
                    label,
                    (
                        label_x + 4,
                        label_y - 5,
                    ),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (0, 0, 0),
                    2,
                    cv2.LINE_AA,
                )

            else:

                print(
                    "[U-Net] No lesion bounding "
                    "box detected."
                )

            bbox_success = cv2.imwrite(
                str(bbox_path),
                bbox_image,
            )

            if not bbox_success:

                raise RuntimeError(
                    "Failed to save bounding box image."
                )

            # =================================================
            # Save database localization data
            # =================================================

            scan.mask_path = (
                f"masks/{mask_filename}"
            )

            scan.area_pixels = float(
                metrics[
                    "areaPixels"
                ]
            )

            scan.perimeter_pixels = float(
                metrics[
                    "perimeterPixels"
                ]
            )

            if bbox is not None:

                scan.bbox_x = float(
                    bbox["x"]
                )

                scan.bbox_y = float(
                    bbox["y"]
                )

                scan.bbox_width = float(
                    bbox["width"]
                )

                scan.bbox_height = float(
                    bbox["height"]
                )

            # =================================================
            # API localization response
            # =================================================

            localization = {

                # Binary mask
                "mask": (
                    f"/storage/masks/"
                    f"{mask_filename}"
                ),

                # Segmented lesion
                "segmented": (
                    f"/storage/segmented/"
                    f"{segmented_filename}"
                ),

                # Original + bounding box
                "bboxImage": (
                    f"/storage/bbox/"
                    f"{bbox_filename}"
                ),

                # Metrics
                "areaPixels": (
                    metrics[
                        "areaPixels"
                    ]
                ),

                "areaAffectedPercent": (
                    metrics[
                        "areaAffectedPercent"
                    ]
                ),

                "perimeterPixels": (
                    metrics[
                        "perimeterPixels"
                    ]
                ),

                # Numerical bbox
                "bbox": bbox,
            }

            # =================================================
            # Console information
            # =================================================

            print(
                f"[U-Net] Segmentation completed "
                f"for scan {scan.id}"
            )

            print(
                f"[U-Net] Affected area: "
                f"{metrics['areaAffectedPercent']:.2f}%"
            )

            print(
                f"[U-Net] Bounding box: "
                f"{bbox}"
            )

            print(
                f"[U-Net] Mask: "
                f"{mask_filename}"
            )

            print(
                f"[U-Net] Segmented: "
                f"{segmented_filename}"
            )

            print(
                f"[U-Net] BBox image: "
                f"{bbox_filename}"
            )

    except Exception as exc:

        print(
            f"[U-Net] Segmentation failed: "
            f"{exc}"
        )

    # =====================================================
    # Save updated database record
    # =====================================================

    db.commit()
    db.refresh(scan)

    # =====================================================
    # Final API response
    # =====================================================

    return {

        "scan_id": scan.id,

        "file_name": scan.file_name,

        "classification": {

            "classIndex": (
                classification[
                    "class_index"
                ]
            ),

            "className": (
                classification[
                    "class_name"
                ]
            ),

            "confidence": (
                classification[
                    "confidence"
                ]
            ),

            "probabilities": (
                classification[
                    "probabilities"
                ]
            ),
        },

        "localization": localization,

        "gradcam": (

            f"/storage/gradcam/"
            f"{scan.id}_gradcam.jpg"

            if gradcam

            else None
        ),
    }