import cv2
import numpy as np
import tensorflow as tf

from app.core.config import (
    UNET_MODEL_PATH,
    IMG_SIZE,
)


class LesionSegmenter:
    def __init__(self):
        self.model = None
        self.loaded = False
        self.load_model()

    def load_model(self):
        if not UNET_MODEL_PATH.exists():
            print(f"[U-Net] Model not found: {UNET_MODEL_PATH}")
            return

        try:
            self.model = tf.keras.models.load_model(
                UNET_MODEL_PATH
            )

            self.loaded = True
            print("[U-Net] Lesion segmentation model loaded successfully.")

        except Exception as exc:
            print("[U-Net] Failed to load model:")
            print(exc)

            self.model = None
            self.loaded = False

    def preprocess_image(self, image_path):
        img = cv2.imread(str(image_path))

        if img is None:
            raise ValueError(
                f"Could not load image: {image_path}"
            )

        img_rgb = cv2.cvtColor(
            img,
            cv2.COLOR_BGR2RGB
        )

        img_resized = cv2.resize(
            img_rgb,
            (IMG_SIZE, IMG_SIZE)
        )

        # IMPORTANT:
        # This matches your original U-Net code.
        seg_input = np.expand_dims(
            img_resized.astype(np.float32) / 255.0,
            axis=0
        )

        return img_resized, seg_input

    def predict(self, image_path):
        if not self.loaded or self.model is None:
            raise RuntimeError(
                "U-Net model is not loaded."
            )

        img_resized, seg_input = self.preprocess_image(
            image_path
        )

        pred_mask_prob = self.model.predict(
            seg_input,
            verbose=0
        )[0, ..., 0]

        # Exact threshold from your code.
        pred_mask_bin = (
            pred_mask_prob > 0.5
        ).astype(np.uint8)

        return {
            "image": img_resized,
            "probability_mask": pred_mask_prob,
            "binary_mask": pred_mask_bin,
        }


segmenter = LesionSegmenter()