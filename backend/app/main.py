import os
import uuid
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import List

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from .detector import PotholeDetector
from .schemas import (
    DetectionResponse,
    HealthResponse,
    AuthenticatedCitizen,
    ReportCreateRequest,
    ReportUpdateRequest,
    ReportResponse,
    SignedUrlRequest,
    SignedUrlResponse,
)
from .auth import get_current_citizen
from .supabase_client import (
    get_supabase_client,
    is_supabase_configured,
    TABLE_REPORTS,
    BUCKET_POTHOLE_ORIGINALS,
    BUCKET_POTHOLE_ANNOTATED,
)

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
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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


def validate_storage_path(path: str, expected_user_id: str) -> None:
    """Validate that a storage path is safely scoped to the citizen's own folder.

    Requirements:
    - Path must begin with the exact authenticated user UUID followed by '/'.
    - Reject leading slashes, empty path segments, '.' and '..' segments.
    - Reject paths belonging to another user.
    - Preserve the existing storage folder structure: {user_id}/{report_id}/filename
    """
    if not path or not isinstance(path, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Storage path must be a non-empty string.",
        )

    # Reject leading slashes or backslashes
    if path.startswith("/") or "\\" in path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed storage path: leading slashes and backslashes are not permitted.",
        )

    segments = path.split("/")
    if any(seg in (".", "..") for seg in segments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed storage path: directory traversal segments ('.' or '..') are strictly prohibited.",
        )

    if any(not seg.strip() for seg in segments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed storage path: empty path segments are not permitted.",
        )

    if len(segments) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed storage path: expected '{user_id}/{report_id}/filename'.",
        )

    # Enforce strict ownership: the first folder segment must match expected_user_id exactly
    if segments[0] != expected_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Storage path must reside within your own citizen user folder.",
        )


@app.get("/api/reports", response_model=List[ReportResponse])
async def list_reports(
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Retrieve all reports from Supabase PostgreSQL (public.reports) for authenticated citizens.

    Preserves city-wide metadata visibility across all wards for civic transparency.
    """
    if not is_supabase_configured():
        return []

    client = get_supabase_client()
    try:
        res = client.table(TABLE_REPORTS).select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch reports from Supabase: {str(exc)}",
        )


@app.get("/api/reports/{report_id}", response_model=ReportResponse)
async def get_report_by_id(
    report_id: str,
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Retrieve metadata for a single report by ID for authenticated citizens.

    Preserves city-wide defect metadata visibility while requiring verified citizen authentication.
    """
    if not is_supabase_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase backend credentials are not configured.",
        )

    client = get_supabase_client()
    try:
        res = client.table(TABLE_REPORTS).select("*").eq("id", report_id).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' not found.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch report: {str(exc)}",
        )


@app.post("/api/reports", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    report_data: ReportCreateRequest,
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Create a new report in public.reports associated strictly with the authenticated citizen.

    Derives citizen user_id directly from the verified Supabase JWT token to prevent spoofing.
    """
    if not is_supabase_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase backend credentials are not configured in backend/.env.",
        )

    # Validate storage paths to prevent traversal and ownership spoofing
    if report_data.image_path:
        validate_storage_path(report_data.image_path, citizen.user_id)
    if report_data.annotated_image_path:
        validate_storage_path(report_data.annotated_image_path, citizen.user_id)

    client = get_supabase_client()
    report_id = str(uuid.uuid4())

    row = {
        "id": report_id,
        "user_id": citizen.user_id,
        "title": report_data.title,
        "description": report_data.description,
        "latitude": report_data.latitude,
        "longitude": report_data.longitude,
        "address": report_data.address,
        "status": "submitted",
        "priority": report_data.priority,
        "pothole_count": report_data.pothole_count,
        "ai_detection": report_data.ai_detection or {},
        "image_path": report_data.image_path,
        "annotated_image_path": report_data.annotated_image_path,
    }

    try:
        res = client.table(TABLE_REPORTS).insert(row).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to insert report into Supabase database.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database insertion failed: {str(exc)}",
        )


@app.patch("/api/reports/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: str,
    update_data: ReportUpdateRequest,
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Update report status or priority in Supabase. Enforces citizen ownership."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase backend credentials are not configured.",
        )

    client = get_supabase_client()
    updates = {}
    if update_data.status is not None:
        updates["status"] = update_data.status
    if update_data.priority is not None:
        updates["priority"] = update_data.priority

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No update fields provided.",
        )

    try:
        # Verify citizen ownership: cannot modify another citizen's report
        existing = client.table(TABLE_REPORTS).select("*").eq("id", report_id).execute()
        if not existing.data or len(existing.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' not found.",
            )

        report_row = existing.data[0]
        if report_row.get("user_id") != citizen.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: You cannot modify a report filed by another citizen.",
            )

        res = client.table(TABLE_REPORTS).update(updates).eq("id", report_id).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' not found.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update report: {str(exc)}",
        )


@app.delete("/api/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: str,
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Delete a report from Supabase. Enforces citizen ownership (HTTP 403 if not owner)."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase backend credentials are not configured.",
        )

    client = get_supabase_client()

    # 1. Fetch existing report to verify ownership
    try:
        existing = client.table(TABLE_REPORTS).select("*").eq("id", report_id).execute()
        if not existing.data or len(existing.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' not found.",
            )

        report_row = existing.data[0]
        # Verify citizen ownership
        if report_row.get("user_id") != citizen.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: You cannot delete a report filed by another citizen.",
            )

        # 2. Delete report from database
        client.table(TABLE_REPORTS).delete().eq("id", report_id).execute()

        # 3. Clean up associated storage objects if present
        if report_row.get("image_path"):
            try:
                client.storage.from_(BUCKET_POTHOLE_ORIGINALS).remove([report_row["image_path"]])
            except Exception:
                pass
        if report_row.get("annotated_image_path"):
            try:
                client.storage.from_(BUCKET_POTHOLE_ANNOTATED).remove([report_row["annotated_image_path"]])
            except Exception:
                pass

        return None
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete report: {str(exc)}",
        )


@app.post("/api/storage/signed-url", response_model=SignedUrlResponse)
async def create_signed_image_url(
    req: SignedUrlRequest,
    citizen: AuthenticatedCitizen = Depends(get_current_citizen),
):
    """Generate time-limited signed URL for an image. Enforces citizen folder ownership."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase backend credentials are not configured.",
        )

    # Validate allowed buckets
    if req.bucket not in [BUCKET_POTHOLE_ORIGINALS, BUCKET_POTHOLE_ANNOTATED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid storage bucket '{req.bucket}'. Allowed buckets: {BUCKET_POTHOLE_ORIGINALS}, {BUCKET_POTHOLE_ANNOTATED}",
        )

    # Validate path format, reject traversal/leading slashes, and enforce folder ownership
    validate_storage_path(req.path, citizen.user_id)

    client = get_supabase_client()
    try:
        res = client.storage.from_(req.bucket).create_signed_url(req.path, req.expires_in)
        signed_url = None
        if isinstance(res, dict):
            signed_url = res.get("signedURL") or res.get("signedUrl")
        elif hasattr(res, "signed_url"):
            signed_url = res.signed_url

        if not signed_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Failed to generate signed URL. Object may not exist in storage.",
            )

        return SignedUrlResponse(signed_url=signed_url, expires_in=req.expires_in)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Storage service failed to generate signed URL: {str(exc)}",
        )


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
