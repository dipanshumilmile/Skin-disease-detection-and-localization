import os

import cv2
import numpy as np
import tensorflow as tf

from app.core.config import (
    CLASS_MODEL_PATH,
    IDX_TO_CLASS,
    IMG_SIZE,
)


class SkinDiseaseClassifier:
    def __init__(self):
        self.model = None
        self.loaded = False

        self.load_model()

    def load_model(self):
        if not CLASS_MODEL_PATH.exists():
            print(
                f"[Classifier] Model not found: {CLASS_MODEL_PATH}"
            )
            return

        try:
            self.model = tf.keras.models.load_model(
                CLASS_MODEL_PATH
            )

            self.loaded = True

            print(
                "[Classifier] EfficientNetV2S model loaded successfully."
            )

        except Exception as exc:
            print(
                "[Classifier] Failed to load model:"
            )
            print(exc)

            self.model = None
            self.loaded = False

    def preprocess_image(self, image_path):
        """
        Matches the preprocessing used in your notebook:

        cv2.imread
        BGR -> RGB
        resize -> 224 x 224
        float32
        batch dimension
        """

        image = cv2.imread(str(image_path))

        if image is None:
            raise ValueError(
                f"Could not read image: {image_path}"
            )

        image_rgb = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2RGB,
        )

        image_resized = cv2.resize(
            image_rgb,
            (IMG_SIZE, IMG_SIZE),
        )

        image_batch = np.expand_dims(
            image_resized.astype("float32"),
            axis=0,
        )

        return image_batch

    def predict(self, image_path):
        if not self.loaded or self.model is None:
            raise RuntimeError(
                "EfficientNetV2S model is not loaded."
            )

        image_batch = self.preprocess_image(
            image_path
        )

        predictions = self.model.predict(
            image_batch,
            verbose=0,
        )[0]

        pred_idx = int(
            np.argmax(predictions)
        )

        confidence = float(
            predictions[pred_idx]
        )

        class_name = IDX_TO_CLASS.get(
            pred_idx,
            f"Class {pred_idx}",
        )

        probabilities = {
            IDX_TO_CLASS.get(
                index,
                f"Class {index}",
            ): float(probability)
            for index, probability in enumerate(
                predictions
            )
        }

        return {
            "class_index": pred_idx,
            "class_name": class_name,
            "confidence": confidence,
            "probabilities": probabilities,
        }


classifier = SkinDiseaseClassifier()