# Pothole Reporter — AI Detection Backend

A lightweight, production-ready FastAPI service that runs real computer vision object-detection inference using fine-tuned **YOLOv8** weights to locate and bounding-box potholes in road imagery.

---

## 🧠 Model Specifications

- **Architecture:** YOLOv8s (You Only Look Once, Version 8 Small)
- **Pretrained Checkpoint:** [`Samdutse/pothole-yolov8`](https://huggingface.co/Samdutse/pothole-yolov8)
- **Training Source:** Smartathon Pothole Dataset via Roboflow Universe
- **Target Class:** `Pothole` (`id: 0`)
- **Validation Metric:** $\text{mAP}_{50} = 0.816$
- **Physical Depth Disclaimer:** Single RGB 2D images cannot measure physical crater depth without stereoscopic sensors or LiDAR. The model outputs 2D bounding boxes and model confidence scores only.

---

## 🚀 Quick Setup & Execution

### 1. Create and Activate Virtual Environment

```bash
cd backend

# On Windows PowerShell:
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# On macOS/Linux:
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the FastAPI Server

```bash
# Inside the backend/ directory with .venv active:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at:
- **Root / Docs:** `http://localhost:8000/docs` (Interactive Swagger UI)
- **Health Check:** `http://localhost:8000/api/health`
- **Detection Endpoint:** `http://localhost:8000/api/detect`

---

## 📡 API Endpoints

### `GET /api/health`
Returns backend health status, loaded model name, classes, and execution device (`cpu` or `cuda`).

**Sample Response:**
```json
{
  "status": "ok",
  "model_name": "best.pt",
  "classes": ["Pothole"],
  "device": "cpu",
  "version": "2.0.0"
}
```

### `POST /api/detect`
Accepts a `multipart/form-data` upload with a `file` field containing a JPEG, PNG, or WebP image (max 10MB).

**Sample Response:**
```json
{
  "success": true,
  "potholes_detected": 2,
  "detections": [
    {
      "x1": 217.1,
      "y1": 105.0,
      "x2": 596.5,
      "y2": 388.2,
      "confidence": 0.8012,
      "class_id": 0,
      "class_name": "Pothole"
    }
  ],
  "annotated_image": "data:image/jpeg;base64,...",
  "image_width": 800,
  "image_height": 533,
  "inference_time_ms": 237.5,
  "model_name": "best.pt",
  "highest_confidence": 0.8012,
  "suggested_priority": "high",
  "notice": "Depth is not estimated: Single RGB imagery cannot measure physical depth without stereoscopic sensors."
}
```

---

## 🛠 Custom Model Checkpoints

To use a custom-trained YOLO `.pt` model:
1. Place your weights file in `backend/models/my_pothole_model.pt`.
2. Set the `MODEL_REPO_OR_PATH` environment variable:
   ```bash
   $env:MODEL_REPO_OR_PATH="models/my_pothole_model.pt"
   ```
3. Restart Uvicorn. The backend will automatically load your local checkpoint.

---

### `GET /api/auth/me`
Protected citizen authentication endpoint. Cryptographically verifies the Supabase JWT Bearer token supplied in the `Authorization: Bearer <token>` header against the Supabase Auth service. Derives the citizen user ID and profile information directly from the verified token.

**Headers:**
- `Authorization: Bearer <supabase_jwt_access_token>`

**Sample Response (HTTP 200):**
```json
{
  "user_id": "7b841793-9c86-44ce-8dbd-0fe82a4d0922",
  "email": "citizen@example.com",
  "role": "authenticated",
  "app_metadata": {
    "provider": "email"
  },
  "user_metadata": {
    "full_name": "Aarav Sharma"
  }
}
```

**Error Responses:**
- `HTTP 401 Unauthorized` (with `WWW-Authenticate: Bearer` header): Returned when Authorization header is missing, uses invalid scheme, token is empty, token signature verification fails, or token is expired.
- `HTTP 503 Service Unavailable`: Returned when backend Supabase credentials have not been configured in `backend/.env`.

---

### `GET /api/reports`
Retrieves all persistent pothole defect reports from Supabase PostgreSQL (`public.reports`), ordered by newest first.

**Sample Response (HTTP 200):**
```json
[
  {
    "id": "5bcd45d9-2c05-4276-ad79-112d87dc261b",
    "user_id": "60bfc6b9-3693-4470-b549-26568c122f30",
    "title": "Outer Ring Road Bellandur Flyover",
    "description": "Deep depression in left bus lane",
    "latitude": 12.9352,
    "longitude": 77.6823,
    "address": "Outer Ring Road, Mahadevapura (Ward 150)",
    "status": "submitted",
    "priority": "critical",
    "pothole_count": 2,
    "image_path": "60bfc6b9-3693-4470-b549-26568c122f30/5bcd45d9-2c05-4276-ad79-112d87dc261b/original.jpg",
    "annotated_image_path": "60bfc6b9-3693-4470-b549-26568c122f30/5bcd45d9-2c05-4276-ad79-112d87dc261b/annotated.jpg",
    "created_at": "2026-11-08T12:00:55.979191+00:00",
    "updated_at": "2026-11-08T12:00:55.979191+00:00"
  }
]
```

---

### `POST /api/reports`
Protected endpoint to create a report in `public.reports`. Associates the report strictly with the authenticated citizen's user ID derived from their Supabase JWT.

**Headers:**
- `Authorization: Bearer <supabase_jwt_access_token>`

**Request Body:**
```json
{
  "title": "Outer Ring Road Bellandur Flyover",
  "description": "Deep depression in left bus lane",
  "latitude": 12.9352,
  "longitude": 77.6823,
  "address": "Outer Ring Road, Mahadevapura (Ward 150)",
  "priority": "critical",
  "pothole_count": 2,
  "image_path": "user-uuid/report-uuid/original.jpg",
  "annotated_image_path": "user-uuid/report-uuid/annotated.jpg"
}
```

**Response (HTTP 201 Created):** Returns the inserted report row.

---

### `DELETE /api/reports/{id}`
Protected endpoint to delete a report. Enforces citizen ownership: returns `HTTP 403 Forbidden` if another citizen attempts to delete a report they did not file. Deletes the database row and cleans up associated storage objects in `pothole-originals` and `pothole-annotated`.

---

## ⚡ Supabase Backend Client & Auth Module

The backend includes a reusable Supabase client module in [`app/supabase_client.py`](app/supabase_client.py) and token verification dependency in [`app/auth.py`](app/auth.py).

### Configuration (`backend/.env`):
```bash
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SECRET_KEY=<your-service-role-secret-key>
```

### Verification Flow:
1. Citizen logs in via the React frontend and obtains an access token (JWT).
2. Frontend sends requests to protected endpoints with `Authorization: Bearer <jwt>`.
3. Backend calls `client.auth.get_user(token)` to verify the token signature cryptographically against Supabase.
4. User ID is extracted from the verified token (`str(user.id)`). Client-supplied user IDs are never trusted.
