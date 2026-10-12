from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]

MODEL_DIR = BASE_DIR / "models"
STORAGE_DIR = BASE_DIR / "storage"

UPLOAD_DIR = STORAGE_DIR / "uploads"
MASK_DIR = STORAGE_DIR / "masks"
GRADCAM_DIR = STORAGE_DIR / "gradcam"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MASK_DIR.mkdir(parents=True, exist_ok=True)
GRADCAM_DIR.mkdir(parents=True, exist_ok=True)


CLASS_MODEL_PATH = MODEL_DIR / "efficientnetv2_skin_disease_final.keras"

UNET_MODEL_PATH = (
    MODEL_DIR / "unet_lesion_segmentation_final.keras"
)
IDX_TO_CLASS = {
    0: "Melanocytic",
    1: "Basal Cell",
    2: "Warts Molluscum",
    3: "Melanoma",
}

NUM_CLASSES = len(IDX_TO_CLASS)

IMG_SIZE = 224