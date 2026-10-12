from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Scan

router = APIRouter(tags=["History"])


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    scans = db.query(Scan).order_by(Scan.created_at.desc()).all()

    return [
        {
            "id": scan.id,
            "file_name": scan.file_name,
            "created_at": scan.created_at.isoformat()
            if scan.created_at else None,
            "predicted_class": scan.predicted_class,
            "confidence": scan.confidence,
            "image_path": scan.image_path,
            "gradcam_path": scan.gradcam_path,
            "mask_path": scan.mask_path,
            "area_pixels": scan.area_pixels,
            "perimeter_pixels": scan.perimeter_pixels,
            "bbox_x": scan.bbox_x,
            "bbox_y": scan.bbox_y,
            "bbox_width": scan.bbox_width,
            "bbox_height": scan.bbox_height,
        }
        for scan in scans
    ]


@router.get("/history/{scan_id}")
def get_history_item(
    scan_id: int,
    db: Session = Depends(get_db),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()

    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    return {
        "id": scan.id,
        "file_name": scan.file_name,
        "created_at": scan.created_at.isoformat()
        if scan.created_at else None,
        "predicted_class": scan.predicted_class,
        "confidence": scan.confidence,
        "image_path": scan.image_path,
        "gradcam_path": scan.gradcam_path,
        "mask_path": scan.mask_path,
    }


@router.delete("/history/{scan_id}")
def delete_history_item(
    scan_id: int,
    db: Session = Depends(get_db),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()

    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    db.delete(scan)
    db.commit()

    return {"message": "History item deleted", "id": scan_id}