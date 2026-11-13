import json
from functools import lru_cache
from typing import Tuple

import cv2
import numpy as np

FACE_THRESHOLD = 0.45


@lru_cache(maxsize=1)
def get_face_app():
    try:
        from insightface.app import FaceAnalysis
    except Exception as exc:
        raise RuntimeError(
            "Chưa cài InsightFace. Chạy: python -m pip install insightface onnxruntime"
        ) from exc

    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CPUExecutionProvider"]
    )
    app.prepare(ctx_id=-1, det_size=(640, 640))
    return app


def read_image(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Không đọc được ảnh")
    return img


def get_largest_face(faces):
    if not faces:
        return None

    return max(
        faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
    )


def extract_embedding(image_path: str) -> np.ndarray:
    img = read_image(image_path)
    app = get_face_app()

    faces = app.get(img)
    face = get_largest_face(faces)

    if face is None:
        raise ValueError("Không phát hiện khuôn mặt trong ảnh")

    embedding = np.asarray(face.normed_embedding, dtype=np.float32)

    if embedding.size == 0:
        raise ValueError("Không trích xuất được đặc trưng khuôn mặt")

    return embedding


def embedding_to_json(embedding: np.ndarray) -> str:
    return json.dumps(embedding.astype(float).tolist())


def embedding_from_json(raw: str) -> np.ndarray:
    return np.asarray(json.loads(raw), dtype=np.float32)


def cosine_distance(emb1: np.ndarray, emb2: np.ndarray) -> float:
    emb1 = emb1 / (np.linalg.norm(emb1) + 1e-12)
    emb2 = emb2 / (np.linalg.norm(emb2) + 1e-12)

    similarity = float(np.dot(emb1, emb2))
    distance = 1.0 - similarity

    return distance


def verify_face_with_embedding(image_path: str, stored_embedding_json: str) -> Tuple[bool, float]:
    new_embedding = extract_embedding(image_path)
    stored_embedding = embedding_from_json(stored_embedding_json)

    distance = cosine_distance(stored_embedding, new_embedding)

    is_match = distance <= FACE_THRESHOLD

    return is_match, distance