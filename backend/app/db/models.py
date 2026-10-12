from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    DateTime,
    ForeignKey,
)
from sqlalchemy.sql import func

from .database import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)

    file_name = Column(String, nullable=False)

    image_path = Column(String, nullable=False)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

    # Classification
    predicted_class = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    gradcam_path = Column(
    String,
    nullable=True,
)

    # U-Net localization
    mask_path = Column(String, nullable=True)

    area_pixels = Column(Float, nullable=True)

    bbox_x = Column(Float, nullable=True)
    bbox_y = Column(Float, nullable=True)
    bbox_width = Column(Float, nullable=True)
    bbox_height = Column(Float, nullable=True)

    perimeter_pixels = Column(Float, nullable=True)