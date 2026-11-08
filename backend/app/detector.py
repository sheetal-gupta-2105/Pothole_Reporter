import base64
import os
import time
from io import BytesIO
from typing import List, Optional

import torch
from huggingface_hub import hf_hub_download
from PIL import Image
from ultralytics import YOLO

from .schemas import BoundingBox, DetectionResponse

# Default verified pothole model
DEFAULT_REPO = "Samdutse/pothole-yolov8"
DEFAULT_FILENAME = "best.pt"


class PotholeDetector:
    _instance: Optional["PotholeDetector"] = None

    def __init__(self, model_source: Optional[str] = None):
        self.model_source = model_source or os.getenv("MODEL_REPO_OR_PATH", DEFAULT_REPO)
        self.filename = os.getenv("MODEL_FILENAME", DEFAULT_FILENAME)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self._load_model()
        self.model_name = os.path.basename(str(self.model_source))
        self.classes = list(self.model.names.values())

    def _load_model(self) -> YOLO:
        # Check if local file exists first (in model_source or backend/models/)
        local_models_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "models", self.filename)
        )
        if os.path.isfile(self.model_source):
            weights_path = self.model_source
        elif os.path.isfile(local_models_path):
            weights_path = local_models_path
        else:
            # Download or use cached from Hugging Face (try offline cache first)
            try:
                weights_path = hf_hub_download(
                    repo_id=self.model_source,
                    filename=self.filename,
                    local_files_only=True,
                )
            except Exception:
                weights_path = hf_hub_download(
                    repo_id=self.model_source,
                    filename=self.filename,
                )

        model = YOLO(weights_path)
        # Move to appropriate device
        model.to(self.device)
        return model

    @classmethod
    def get_instance(cls) -> "PotholeDetector":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def detect(
        self,
        image: Image.Image,
        confidence_threshold: float = 0.25,
    ) -> DetectionResponse:
        start_time = time.perf_counter()

        orig_w, orig_h = image.size
        total_pixels = orig_w * orig_h

        # Run real YOLO inference
        results = self.model.predict(
            source=image,
            conf=confidence_threshold,
            device=self.device,
            verbose=False,
        )

        inference_duration_ms = (time.perf_counter() - start_time) * 1000.0

        detections: List[BoundingBox] = []
        highest_conf = 0.0
        max_box_area_ratio = 0.0

        if len(results) > 0 and results[0].boxes is not None:
            result = results[0]
            boxes = result.boxes

            for box in boxes:
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])
                conf = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = self.model.names.get(class_id, "Pothole")

                box_area = max(0.0, (x2 - x1) * (y2 - y1))
                box_area_ratio = box_area / total_pixels if total_pixels > 0 else 0.0

                if conf > highest_conf:
                    highest_conf = conf
                if box_area_ratio > max_box_area_ratio:
                    max_box_area_ratio = box_area_ratio

                detections.append(
                    BoundingBox(
                        x1=round(x1, 1),
                        y1=round(y1, 1),
                        x2=round(x2, 1),
                        y2=round(y2, 1),
                        confidence=round(conf, 4),
                        class_id=class_id,
                        class_name=class_name,
                    )
                )

            # Generate annotated image
            # result.plot() returns a BGR numpy array
            annotated_bgr = result.plot()
            # Convert BGR to RGB PIL Image
            annotated_rgb = Image.fromarray(annotated_bgr[..., ::-1])

            buf = BytesIO()
            annotated_rgb.save(buf, format="JPEG", quality=88)
            encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
            annotated_image_url = f"data:image/jpeg;base64,{encoded}"
        else:
            annotated_image_url = None

        # Determine suggested priority
        if len(detections) == 0:
            suggested_priority = "low"
        elif highest_conf >= 0.85 or max_box_area_ratio >= 0.12 or len(detections) >= 3:
            suggested_priority = "critical"
        elif highest_conf >= 0.65 or max_box_area_ratio >= 0.05:
            suggested_priority = "high"
        else:
            suggested_priority = "medium"

        return DetectionResponse(
            success=True,
            potholes_detected=len(detections),
            detections=detections,
            annotated_image=annotated_image_url,
            image_width=orig_w,
            image_height=orig_h,
            inference_time_ms=round(inference_duration_ms, 1),
            model_name=self.model_name,
            highest_confidence=round(highest_conf, 4),
            suggested_priority=suggested_priority,
        )
