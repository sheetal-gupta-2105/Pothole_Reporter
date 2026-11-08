from typing import List, Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x1: float = Field(..., description="Top-left X coordinate in pixels")
    y1: float = Field(..., description="Top-left Y coordinate in pixels")
    x2: float = Field(..., description="Bottom-right X coordinate in pixels")
    y2: float = Field(..., description="Bottom-right Y coordinate in pixels")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence score")
    class_id: int = Field(..., description="Zero-indexed class ID")
    class_name: str = Field(..., description="Detected defect class label (e.g. Pothole)")


class DetectionResponse(BaseModel):
    success: bool = True
    potholes_detected: int = Field(..., ge=0, description="Total count of pothole instances found")
    detections: List[BoundingBox] = Field(default_factory=list, description="List of bounding boxes")
    annotated_image: Optional[str] = Field(
        None, description="Base64-encoded JPEG data URL of the image with bounding boxes"
    )
    image_width: int = Field(..., ge=1, description="Original image width in pixels")
    image_height: int = Field(..., ge=1, description="Original image height in pixels")
    inference_time_ms: float = Field(..., ge=0.0, description="Inference latency in milliseconds")
    model_name: str = Field(..., description="Identifier of the loaded detection model")
    highest_confidence: float = Field(0.0, ge=0.0, le=1.0, description="Peak confidence score")
    suggested_priority: str = Field(
        "low", description="Triage priority estimation based on detected bounding boxes: critical, high, medium, low"
    )
    notice: str = Field(
        "Depth is not estimated: Single RGB imagery cannot measure physical depth without stereoscopic sensors.",
        description="Physical limitation disclaimer",
    )


class HealthResponse(BaseModel):
    status: str = "ok"
    model_name: str
    classes: List[str]
    device: str
    version: str = "2.0.0"


class AuthenticatedCitizen(BaseModel):
    user_id: str = Field(..., description="Unique Supabase UUID of the authenticated citizen")
    email: Optional[str] = Field(None, description="Citizen email address")
    role: str = Field("authenticated", description="Supabase auth role")
    app_metadata: dict = Field(default_factory=dict, description="Application metadata from Supabase Auth")
    user_metadata: dict = Field(default_factory=dict, description="User-supplied metadata (e.g. full name)")

