import cv2
import numpy as np


def mask_to_bbox_and_area(mask):
    mask = (mask > 0).astype(np.uint8)

    total_pixels = mask.shape[0] * mask.shape[1]
    lesion_pixels = int(np.count_nonzero(mask))

    area_pct = (
        lesion_pixels / total_pixels * 100
        if total_pixels > 0
        else 0.0
    )

    ys, xs = np.where(mask > 0)

    if len(xs) == 0 or len(ys) == 0:
        return None, area_pct

    x_min = int(xs.min())
    x_max = int(xs.max())
    y_min = int(ys.min())
    y_max = int(ys.max())

    bbox = [x_min, y_min, x_max, y_max]

    return bbox, area_pct


def calculate_perimeter(mask):
    mask_uint8 = (
        (mask > 0).astype(np.uint8) * 255
    )

    contours, _ = cv2.findContours(
        mask_uint8,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        return 0.0

    perimeter = sum(
        cv2.arcLength(contour, True)
        for contour in contours
    )

    return float(perimeter)


def get_localization_metrics(mask):
    bbox, area_pct = mask_to_bbox_and_area(mask)

    area_pixels = int(np.count_nonzero(mask))

    perimeter_pixels = calculate_perimeter(mask)

    if bbox is None:
        bbox_data = None
    else:
        x_min, y_min, x_max, y_max = bbox

        bbox_data = {
            "x": x_min,
            "y": y_min,
            "width": x_max - x_min,
            "height": y_max - y_min,
            "xMin": x_min,
            "yMin": y_min,
            "xMax": x_max,
            "yMax": y_max,
        }

    return {
        "areaPixels": area_pixels,
        "areaAffectedPercent": float(area_pct),
        "perimeterPixels": perimeter_pixels,
        "bbox": bbox_data,
    }