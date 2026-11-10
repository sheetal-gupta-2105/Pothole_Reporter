from io import BytesIO
from fastapi.testclient import TestClient
from PIL import Image
import numpy as np
import pytest

from app.main import app

client = TestClient(app)


@pytest.mark.parametrize("method", ["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
def test_cors_allows_api_methods(method):
    response = client.options(
        "/api/reports",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert method in response.headers["access-control-allow-methods"]
    assert response.headers["access-control-allow-headers"]


def test_health_check():
    """Verify health endpoint returns 200 OK and model metadata."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "Pothole" in data["classes"]
    assert "device" in data


def test_clean_image_no_hallucination():
    """Verify clean image produces 0 pothole detections (no hallucinated detections)."""
    # Create pure white clean image
    img = Image.new("RGB", (320, 320), color="white")
    buf = BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/api/detect",
        files={"file": ("clean_road.jpg", buf, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["potholes_detected"] == 0
    assert len(data["detections"]) == 0
    assert data["highest_confidence"] == 0.0
    assert data["suggested_priority"] == "low"
    assert "Depth is not estimated" in data["notice"]


def test_invalid_mime_type_rejected():
    """Verify non-image formats are rejected with 415 Unsupported Media Type."""
    text_data = BytesIO(b"Hello world, this is a text file.")
    response = client.post(
        "/api/detect",
        files={"file": ("document.txt", text_data, "text/plain")},
    )
    assert response.status_code == 415
    assert "Unsupported file format" in response.json()["detail"]


def test_malformed_image_rejected():
    """Verify corrupted image bytes return 400 Bad Request."""
    corrupt_data = BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01not-a-valid-jpeg-stream")
    response = client.post(
        "/api/detect",
        files={"file": ("corrupt.jpg", corrupt_data, "image/jpeg")},
    )
    assert response.status_code == 400
    assert "Malformed" in response.json()["detail"]


def test_oversized_file_rejected():
    """Verify files larger than 10MB return 413 Payload Too Large."""
    # 11 MB of dummy data with image content-type
    oversized_data = BytesIO(b"0" * (11 * 1024 * 1024))
    response = client.post(
        "/api/detect",
        files={"file": ("huge.jpg", oversized_data, "image/jpeg")},
    )
    assert response.status_code == 413
    assert "exceeds maximum allowed limit" in response.json()["detail"]


def test_real_pothole_inference():
    """Verify real inference against a simulated road texture image."""
    # Synthesize an image with an irregular dark crater texture
    arr = np.ones((400, 400, 3), dtype=np.uint8) * 150
    # Create dark pothole shape
    for y in range(120, 260):
        for x in range(120, 260):
            if ((x - 190) ** 2 + (y - 190) ** 2) < 3500:
                arr[y, x] = [30, 25, 20]

    img = Image.fromarray(arr)
    buf = BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/api/detect",
        files={"file": ("synthetic_pothole.jpg", buf, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "inference_time_ms" in data
    assert data["image_width"] == 400
    assert "pothole" in data["model_name"].lower()


def test_real_pothole_image_with_detections_and_annotated_output():
    """Verify real inference on an actual pothole photograph returns bounding boxes and annotated image."""
    import os

    # Look for sample1.jpg in public/samples
    sample_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../public/samples/sample1.jpg"))
    assert os.path.exists(sample_path), f"Sample image not found at {sample_path}"

    with open(sample_path, "rb") as f:
        response = client.post(
            "/api/detect",
            files={"file": ("sample1.jpg", f, "image/jpeg")},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["potholes_detected"] >= 1
    assert len(data["detections"]) >= 1
    assert data["annotated_image"] is not None
    assert data["annotated_image"].startswith("data:image/jpeg;base64,")
    assert data["highest_confidence"] > 0.5
    assert data["suggested_priority"] in ["high", "critical"]
    assert "Depth is not estimated" in data["notice"]

    # Verify bounding box coordinates are numeric and valid
    box = data["detections"][0]
    assert box["x1"] >= 0 and box["y1"] >= 0
    assert box["x2"] > box["x1"] and box["y2"] > box["y1"]
    assert box["class_name"] == "Pothole"
    assert 0.0 <= box["confidence"] <= 1.0
