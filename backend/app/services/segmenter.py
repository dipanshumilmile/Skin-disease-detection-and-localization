import cv2
import numpy as np
import tensorflow as tf

from app.core.config import (
    UNET_MODEL_PATH,
    IMG_SIZE,
)


# ---------------------------------------------------------
# Custom loss used when the U-Net model was trained
# ---------------------------------------------------------

def bce_dice_loss(y_true, y_pred):

    # Binary Cross Entropy
    bce = tf.keras.backend.binary_crossentropy(
        y_true,
        y_pred,
    )

    # Dice coefficient
    smooth = 1e-6

    intersection = tf.reduce_sum(
        y_true * y_pred,
        axis=[1, 2, 3],
    )

    denominator = (
        tf.reduce_sum(
            y_true,
            axis=[1, 2, 3],
        )
        +
        tf.reduce_sum(
            y_pred,
            axis=[1, 2, 3],
        )
    )

    dice = (
        (2.0 * intersection + smooth)
        /
        (denominator + smooth)
    )

    dice_loss = 1.0 - dice

    return (
        tf.reduce_mean(bce)
        +
        tf.reduce_mean(dice_loss)
    )


class LesionSegmenter:

    def __init__(self):

        self.model = None
        self.loaded = False

        self.load_model()

    # -----------------------------------------------------
    # Load U-Net
    # -----------------------------------------------------

    def load_model(self):

        if not UNET_MODEL_PATH.exists():

            print(
                f"[U-Net] Model not found: "
                f"{UNET_MODEL_PATH}"
            )

            return

        try:

            self.model = tf.keras.models.load_model(
                UNET_MODEL_PATH,
                custom_objects={
                    "bce_dice_loss": bce_dice_loss
                },
                compile=False,
            )

            self.loaded = True

            print(
                "[U-Net] Lesion segmentation "
                "model loaded successfully."
            )

        except Exception as exc:

            print(
                "[U-Net] Failed to load model:"
            )

            print(exc)

            self.model = None
            self.loaded = False

    # -----------------------------------------------------
    # Preprocess image
    # -----------------------------------------------------

    def preprocess_image(
        self,
        image_path,
    ):

        img = cv2.imread(
            str(image_path)
        )

        if img is None:

            raise ValueError(
                f"Could not load image: "
                f"{image_path}"
            )

        img_rgb = cv2.cvtColor(
            img,
            cv2.COLOR_BGR2RGB,
        )

        img_resized = cv2.resize(
            img_rgb,
            (
                IMG_SIZE,
                IMG_SIZE,
            ),
        )

        # Same preprocessing used during
        # U-Net training
        seg_input = np.expand_dims(
            img_resized.astype(
                np.float32
            ) / 255.0,
            axis=0,
        )

        return (
            img_resized,
            seg_input,
        )

    # -----------------------------------------------------
    # Clean predicted mask
    # -----------------------------------------------------

    def clean_mask(
        self,
        binary_mask,
    ):

        mask = (
            binary_mask.astype(
                np.uint8
            )
        )

        # -------------------------------------------------
        # Step 1: Remove tiny isolated noise
        # -------------------------------------------------

        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (3, 3),
        )

        mask = cv2.morphologyEx(
            mask,
            cv2.MORPH_OPEN,
            kernel,
            iterations=1,
        )

        # -------------------------------------------------
        # Step 2: Fill small gaps inside lesion
        # -------------------------------------------------

        mask = cv2.morphologyEx(
            mask,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=2,
        )

        # -------------------------------------------------
        # Step 3: Find connected components
        # -------------------------------------------------

        num_labels, labels, stats, _ = (
            cv2.connectedComponentsWithStats(
                mask,
                connectivity=8,
            )
        )

        # No foreground detected
        if num_labels <= 1:

            return np.zeros_like(
                mask,
                dtype=np.uint8,
            )

        # -------------------------------------------------
        # Step 4: Keep largest foreground component
        #
        # Label 0 = background
        # Therefore start from label 1.
        # -------------------------------------------------

        component_areas = stats[
            1:,
            cv2.CC_STAT_AREA,
        ]

        largest_label = (
            1
            +
            int(
                np.argmax(
                    component_areas
                )
            )
        )

        cleaned_mask = np.zeros_like(
            mask,
            dtype=np.uint8,
        )

        cleaned_mask[
            labels == largest_label
        ] = 1

        # -------------------------------------------------
        # Step 5: Final small closing
        # -------------------------------------------------

        cleaned_mask = cv2.morphologyEx(
            cleaned_mask,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=1,
        )

        return cleaned_mask

    # -----------------------------------------------------
    # Create segmented lesion image
    # -----------------------------------------------------

    def create_segmented_image(
        self,
        image,
        mask,
    ):

        segmented = np.zeros_like(
            image,
            dtype=np.uint8,
        )

        lesion_pixels = (
            mask > 0
        )

        segmented[
            lesion_pixels
        ] = image[
            lesion_pixels
        ]

        return segmented

    # -----------------------------------------------------
    # Predict segmentation
    # -----------------------------------------------------

    def predict(
        self,
        image_path,
    ):

        if (
            not self.loaded
            or self.model is None
        ):

            raise RuntimeError(
                "U-Net model is not loaded."
            )

        # -------------------------------------------------
        # Preprocess
        # -------------------------------------------------

        (
            img_resized,
            seg_input,
        ) = self.preprocess_image(
            image_path
        )

        # -------------------------------------------------
        # U-Net prediction
        # -------------------------------------------------

        pred_mask_prob = (
            self.model.predict(
                seg_input,
                verbose=0,
            )[0, ..., 0]
        )

        # -------------------------------------------------
        # Threshold
        # -------------------------------------------------

        raw_mask = (
            pred_mask_prob > 0.5
        ).astype(
            np.uint8
        )

        # -------------------------------------------------
        # Clean mask
        # -------------------------------------------------

        pred_mask_bin = (
            self.clean_mask(
                raw_mask
            )
        )

        # -------------------------------------------------
        # Create segmented lesion image
        # -------------------------------------------------

        segmented_image = (
            self.create_segmented_image(
                img_resized,
                pred_mask_bin,
            )
        )

        # -------------------------------------------------
        # Create display-ready binary mask
        #
        # Background = 0
        # Lesion     = 255
        # -------------------------------------------------

        mask_image = (
            pred_mask_bin * 255
        ).astype(
            np.uint8
        )

        # -------------------------------------------------
        # Calculate affected area
        # -------------------------------------------------

        area_pixels = int(
            np.count_nonzero(
                pred_mask_bin
            )
        )

        total_pixels = (
            IMG_SIZE * IMG_SIZE
        )

        area_percent = (
            area_pixels
            /
            total_pixels
            *
            100.0
        )

        print(
            "[U-Net] Segmentation completed"
        )

        print(
            f"[U-Net] Affected area: "
            f"{area_percent:.2f}%"
        )

        return {

            # Original resized image
            "image": img_resized,

            # Raw probability map
            "probability_mask": (
                pred_mask_prob
            ),

            # Clean binary mask
            "binary_mask": (
                pred_mask_bin
            ),

            # 0/255 mask for frontend/image saving
            "mask_image": (
                mask_image
            ),

            # Original image with everything
            # except lesion removed
            "segmented_image": (
                segmented_image
            ),

            # Useful for localization
            "area_pixels": (
                area_pixels
            ),

            "area_percent": (
                float(area_percent)
            ),
        }


# ---------------------------------------------------------
# Global U-Net segmenter
# ---------------------------------------------------------

segmenter = LesionSegmenter()