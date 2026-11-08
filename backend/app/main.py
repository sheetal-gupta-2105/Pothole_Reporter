import os
from contextlib import asynccontextmanager
from io import BytesIO
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from .detector import PotholeDetector
from .schemas import DetectionResponse, HealthResponse, AuthenticatedCitizen
from .auth import get_current_citizen

# Configuration constants
MAX_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10")) * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up detector on startup
    try:
        PotholeDetector.get_instance()
    except Exception as exc:
        print(f"Warning during detector startup warmup: {exc}")
    yield


app = FastAPI(
    title="Pothole Reporter AI Backend",
    description="Real-time YOLOv8 pothole detection API for civic road infrastructure monitoring in Bengaluru, India.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    detector = PotholeDetector.get_instance()
    return HealthResponse(
        status="ok",
        model_name=detector.model_name,
        classes=detector.classes,
        device=detector.device,
        version="2.0.0",
    )


@app.get("/api/auth/me", response_model=AuthenticatedCitizen)
async def get_current_user_profile(
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Retrieve verified citizen profile from Supabase JWT token."""
    return citizen


@app.post("/api/detect", response_model=DetectionResponse)
async def detect_potholes(
    file: UploadFile = File(..., description="Road photo to inspect (JPEG, PNG, or WebP)")
):
    # 1. Validate MIME type
    content_type = file.content_type.lower() if file.content_type else ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file format '{content_type}'. Please upload JPEG, PNG, or WebP images.",
        )

    # 2. Read contents safely and check size
    contents = await file.read()
    file_size = len(contents)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if file_size > MAX_UPLOAD_SIZE_BYTES:
        max_mb = MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Image size ({file_size / (1024 * 1024):.1f} MB) exceeds maximum allowed limit of {max_mb} MB.",
        )

    # 3. Validate image integrity
    try:
        image = Image.open(BytesIO(contents))
        image.verify()  # Verify integrity
        # Reopen for actual processing (verify closes/corrupts original handle in PIL)
        image = Image.open(BytesIO(contents)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed or unreadable image file. Unable to decode image buffer.",
        )

    # 4. Perform real inference
    try:
        detector = PotholeDetector.get_instance()
        response = detector.detect(image)
        return response
    except Exception as exc:
        # Never fabricate detections on failure
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Object detection inference failed: {str(exc)}",
        )
