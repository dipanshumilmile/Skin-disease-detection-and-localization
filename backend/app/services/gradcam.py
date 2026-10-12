from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf

from app.core.config import (
    GRADCAM_DIR,
    IMG_SIZE,
    IDX_TO_CLASS,
)


def find_efficientnet_base_model(model):
    """
    Find the EfficientNetV2S model inside the loaded
    inference model.
    """

    for layer in model.layers:
        if "efficientnetv2" in layer.name.lower():
            return layer

    # Same fallback idea as the notebook.
    if len(model.layers) > 1:
        return model.layers[1]

    raise ValueError(
        "Could not locate EfficientNetV2S base model."
    )


def get_last_conv_layer_name(base_model):
    """
    Find the last layer whose output is spatial
    (4-dimensional).
    """

    for layer in reversed(base_model.layers):
        try:
            output_shape = layer.output.shape

            if len(output_shape) == 4:
                return layer.name

        except (AttributeError, ValueError):
            continue

    raise ValueError(
        "Could not find a suitable Grad-CAM layer."
    )


def make_gradcam_heatmap(
    image_batch,
    model,
    pred_index=None,
):
    base_model = find_efficientnet_base_model(
        model
    )

    last_conv_layer_name = (
        get_last_conv_layer_name(
            base_model
        )
    )

    target_conv_layer = (
        base_model.get_layer(
            last_conv_layer_name
        )
    )

    grad_model = tf.keras.Model(
        inputs=base_model.input,
        outputs=[
            target_conv_layer.output,
            base_model.output,
        ],
    )

    classification_layers = []

    found_base = False

    for layer in model.layers:
        if layer == base_model:
            found_base = True
            continue

        if found_base:
            classification_layers.append(layer)

    with tf.GradientTape() as tape:

        conv_outputs, base_output = (
            grad_model(image_batch)
        )

        x = base_output

        for layer in classification_layers:
            x = layer(x)

        predictions = x

        if pred_index is None:
            pred_index = int(
                tf.argmax(
                    predictions[0]
                )
            )

        class_channel = predictions[
            :,
            pred_index,
        ]

    gradients = tape.gradient(
        class_channel,
        conv_outputs,
    )

    if gradients is None:
        raise RuntimeError(
            "Could not calculate Grad-CAM gradients."
        )

    pooled_gradients = tf.reduce_mean(
        gradients,
        axis=(0, 1, 2),
    )

    conv_outputs = conv_outputs[0]

    heatmap = (
        conv_outputs
        @ pooled_gradients[..., tf.newaxis]
    )

    heatmap = tf.squeeze(heatmap)

    heatmap = tf.maximum(
        heatmap,
        0,
    )

    heatmap = heatmap / (
        tf.reduce_max(heatmap) + 1e-8
    )

    return (
        heatmap.numpy(),
        int(pred_index),
        predictions.numpy()[0],
        last_conv_layer_name,
    )


def create_gradcam_overlay(
    original_image,
    heatmap,
    alpha=0.4,
):
    """
    original_image is RGB uint8.
    """

    height, width = (
        original_image.shape[:2]
    )

    heatmap_resized = cv2.resize(
        heatmap,
        (width, height),
    )

    heatmap_uint8 = np.uint8(
        255 * heatmap_resized
    )

    heatmap_color = cv2.applyColorMap(
        heatmap_uint8,
        cv2.COLORMAP_JET,
    )

    heatmap_color = cv2.cvtColor(
        heatmap_color,
        cv2.COLOR_BGR2RGB,
    )

    overlay = cv2.addWeighted(
        original_image,
        1 - alpha,
        heatmap_color,
        alpha,
        0,
    )

    return heatmap_color, overlay


def generate_gradcam(
    model,
    image_path,
    output_name,
):
    image = cv2.imread(
        str(image_path)
    )

    if image is None:
        raise ValueError(
            f"Could not read image: {image_path}"
        )

    image_rgb = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB,
    )

    resized = cv2.resize(
        image_rgb,
        (IMG_SIZE, IMG_SIZE),
    )

    image_batch = np.expand_dims(
        resized.astype("float32"),
        axis=0,
    )

    heatmap, pred_idx, probabilities, layer_name = (
        make_gradcam_heatmap(
            image_batch,
            model,
        )
    )

    _, overlay = create_gradcam_overlay(
        resized,
        heatmap,
    )

    output_path = (
        GRADCAM_DIR / output_name
    )

    # Convert RGB -> BGR for OpenCV
    overlay_bgr = cv2.cvtColor(
        overlay,
        cv2.COLOR_RGB2BGR,
    )

    success = cv2.imwrite(
        str(output_path),
        overlay_bgr,
    )

    if not success:
        raise RuntimeError(
            "Could not save Grad-CAM image."
        )

    return {
        "path": str(output_path),
        "class_index": pred_idx,
        "class_name": IDX_TO_CLASS.get(
            pred_idx,
            f"Class {pred_idx}",
        ),
        "confidence": float(
            probabilities[pred_idx]
        ),
        "layer": layer_name,
    }