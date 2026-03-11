"""Flora local model inference service.

Runs a small Flask server exposing:
- GET /health
- POST /predict

The backend (`backend/pages/api/identify.ts`) sends multipart image uploads to
`/predict` and expects JSON with at least `class` and `confidence`.
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D
from tensorflow.keras.models import Model, load_model

IMG_SIZE = (224, 224)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", ROOT_DIR / "plant_model.h5")).expanduser()
MIN_LEAF_LIKELIHOOD = float(os.environ.get("MIN_LEAF_LIKELIHOOD", "0.02"))

# Keep this order aligned with the model output tensor order.
CLASS_NAMES = [
    "Pepper__bell___Bacterial_spot",
    "Pepper__bell___healthy",
    "PlantVillage",
    "Potato___Early_blight",
    "Potato___Late_blight",
    "Potato___healthy",
    "Tomato_Bacterial_spot",
    "Tomato_Early_blight",
    "Tomato_Late_blight",
    "Tomato_Leaf_Mold",
    "Tomato_Septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite",
    "Tomato__Target_Spot",
    "Tomato__Tomato_YellowLeaf__Curl_Virus",
    "Tomato__Tomato_mosaic_virus",
    "Tomato_healthy",
]

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

_model = None
_model_error = ""


def _normalize_token(value: str) -> str:
    return " ".join(part for part in value.replace("_", " ").split(" ") if part).strip()


def _title_case(value: str) -> str:
    return _normalize_token(value).title()


def _decode_class_name(label: str) -> dict[str, Any]:
    normalized = (label or "").strip()
    lower = normalized.lower()

    if "pepper" in lower:
        plant_name = "Pepper"
    elif "potato" in lower:
        plant_name = "Potato"
    elif "tomato" in lower:
        plant_name = "Tomato"
    else:
        plant_name = ""

    is_healthy = "healthy" in lower
    disease_name = ""

    if not is_healthy:
        if "bacterial_spot" in lower:
            disease_name = "Bacterial Spot"
        elif "early_blight" in lower:
            disease_name = "Early Blight"
        elif "late_blight" in lower:
            disease_name = "Late Blight"
        elif "leaf_mold" in lower:
            disease_name = "Leaf Mold"
        elif "septoria_leaf_spot" in lower:
            disease_name = "Septoria Leaf Spot"
        elif "spider_mites" in lower:
            disease_name = "Spider Mites Two Spotted Spider Mite"
        elif "target_spot" in lower:
            disease_name = "Target Spot"
        elif "yellowleaf" in lower and "curl" in lower:
            disease_name = "Tomato Yellow Leaf Curl Virus"
        elif "mosaic_virus" in lower:
            disease_name = "Tomato Mosaic Virus"
        elif lower != "plantvillage":
            cleaned = normalized.replace("___", "_")
            for prefix in ("Pepper__bell_", "Potato_", "Tomato__Tomato_", "Tomato__", "Tomato_"):
                if cleaned.startswith(prefix):
                    cleaned = cleaned[len(prefix) :]
                    break
            disease_name = _title_case(cleaned)

    return {
        "plant_name": plant_name,
        "disease_name": disease_name,
        "is_healthy": is_healthy,
    }


def _safe_class_names(output_units: int) -> list[str]:
    names = list(CLASS_NAMES)
    if output_units < len(names):
        return names[:output_units]
    if output_units > len(names):
        extra = [f"class_{index}" for index in range(len(names), output_units)]
        return names + extra
    return names


def _build_legacy_model(num_classes: int) -> Model:
    """Rebuilds the original training architecture for H5 weight loading fallback."""
    base_model = MobileNetV2(weights=None, include_top=False, input_shape=(224, 224, 3))
    base_model.trainable = False

    features = base_model.output
    features = GlobalAveragePooling2D()(features)
    features = Dense(128, activation="relu")(features)
    outputs = Dense(num_classes, activation="softmax")(features)
    return Model(inputs=base_model.input, outputs=outputs)


def _load_model() -> tuple[Any, str]:
    global _model
    global _model_error

    if _model is not None or _model_error:
        return _model, _model_error

    try:
        _model = load_model(MODEL_PATH)
    except Exception as exc:
        # Some exported .h5 files fail direct deserialization on newer Keras.
        # Rebuilding the known architecture and loading weights is more stable.
        try:
            fallback_model = _build_legacy_model(len(CLASS_NAMES))
            fallback_model.load_weights(str(MODEL_PATH))
            _model = fallback_model
        except Exception as fallback_exc:  # pragma: no cover - error path only
            _model_error = (
                f"Failed to load model at {MODEL_PATH}: {exc}\n"
                f"Fallback reconstruction failed: {fallback_exc}"
            )
    return _model, _model_error


def _preprocess_image(raw_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    lanczos = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    image = image.resize(IMG_SIZE, lanczos)

    image_array = np.asarray(image, dtype=np.float32)
    image_tensor = np.expand_dims(image_array / 255.0, axis=0)
    return image_array, image_tensor


def _estimate_leaf_likelihood(image_array: np.ndarray) -> float:
    """
    Heuristic score in [0,1] estimating whether the image contains leaf-like pixels.
    A low score likely indicates object/scene photos (for example vegetables on a table)
    that are out-of-domain for this leaf disease model.
    """
    red = image_array[:, :, 0]
    green = image_array[:, :, 1]
    blue = image_array[:, :, 2]

    dominant_green = (green > red * 1.05) & (green > blue * 1.05)
    green_contrast = (green - np.minimum(red, blue)) > 18.0
    saturation = (np.maximum.reduce([red, green, blue]) - np.minimum.reduce([red, green, blue])) > 28.0

    leaf_like = dominant_green & green_contrast & saturation
    return float(np.mean(leaf_like))


def _plant_scores(predictions: np.ndarray, class_names: list[str]) -> dict[str, float]:
    scores = {"Pepper": 0.0, "Potato": 0.0, "Tomato": 0.0}
    for index, class_name in enumerate(class_names):
        decoded = _decode_class_name(class_name)
        plant = decoded["plant_name"]
        if plant in scores:
            scores[plant] += float(predictions[index])
    return scores


@app.get("/health")
def health():
    model, error = _load_model()
    status_code = 200 if model is not None else 500
    return (
        jsonify(
            {
                "ok": model is not None,
                "model_path": str(MODEL_PATH),
                "error": error or None,
            }
        ),
        status_code,
    )


@app.post("/predict")
def predict():
    model, error = _load_model()
    if model is None:
        return jsonify({"error": error or "Model is not loaded"}), 500

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    uploaded = request.files["image"]
    raw_bytes = uploaded.read()
    if not raw_bytes:
        return jsonify({"error": "Empty image payload"}), 400

    try:
        image_array, tensor = _preprocess_image(raw_bytes)
    except Exception:
        return jsonify({"error": "Invalid image payload"}), 400

    leaf_likelihood = _estimate_leaf_likelihood(image_array)
    if leaf_likelihood < MIN_LEAF_LIKELIHOOD:
        return jsonify(
            {
                "class": "PlantVillage",
                "confidence": 0.0,
                "plant_name": "",
                "disease_name": "",
                "predicted_plant": "",
                "predicted_disease": "",
                "is_healthy": False,
                "top_classes": [],
                "plant_scores": {"Pepper": 0.0, "Potato": 0.0, "Tomato": 0.0},
                "leaf_likelihood": leaf_likelihood,
                "needs_retry": True,
                "retry_message": "Image does not look like a clear leaf. Try again with a close leaf photo."
            }
        )

    try:
        predictions = np.asarray(model.predict(tensor, verbose=0))[0]
    except Exception:
        return jsonify({"error": "Model inference failed"}), 500

    if predictions.ndim != 1:
        return jsonify({"error": "Model output shape is invalid"}), 500

    class_names = _safe_class_names(predictions.shape[0])
    top_index = int(np.argmax(predictions))
    top_class = class_names[top_index]
    confidence = float(np.max(predictions))

    decoded = _decode_class_name(top_class)
    top_indices = np.argsort(predictions)[::-1][:3]
    top_classes = [
        {"class": class_names[int(index)], "confidence": float(predictions[int(index)])}
        for index in top_indices
    ]
    plant_scores = _plant_scores(predictions, class_names)
    predicted_plant = max(plant_scores.items(), key=lambda item: item[1])[0]

    return jsonify(
        {
            "class": top_class,
            "confidence": confidence,
            "plant_name": decoded["plant_name"],
            "disease_name": decoded["disease_name"],
            "predicted_plant": predicted_plant,
            "predicted_disease": decoded["disease_name"],
            "is_healthy": bool(decoded["is_healthy"]),
            "top_classes": top_classes,
            "plant_scores": plant_scores,
            "leaf_likelihood": leaf_likelihood,
            "needs_retry": False,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5050")))
