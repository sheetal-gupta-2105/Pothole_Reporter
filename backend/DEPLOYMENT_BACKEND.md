# Backend Deployment — Google Cloud Run

This document outlines the container build, environment configuration, and execution requirements for the Pothole Reporter FastAPI backend on Google Cloud Run.

---

## 1. Container Build (Project Root Context)

The Docker build context must always be the **project root** directory so that `.dockerignore` rules apply correctly:

```bash
# Execute from the project root:
docker build -f backend/Dockerfile -t pothole-reporter-backend .
```

### Model Revision & Production Immutability
The build downloads the YOLOv8 model (`best.pt`) directly from the Hugging Face repository `Samdutse/pothole-yolov8` at image build time into `/app/models/best.pt`.

- The default revision is `main`, which is **mutable**.
- For production releases, an immutable commit hash from the Hugging Face repository commit history must be selected before final release.
- To specify an immutable commit hash during build:
  ```bash
  docker build -f backend/Dockerfile --build-arg MODEL_REVISION=<commit-hash> -t pothole-reporter-backend .
  ```
- *Note:* Do not guess or invent a commit hash; retrieve the verified hash from the official repository history.

---

## 2. Running Locally with Docker

To test the container image locally before pushing to Artifact Registry:

```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e SUPABASE_URL=https://<your-project-id>.supabase.co \
  -e SUPABASE_SECRET_KEY=<your-supabase-service-role-key> \
  -e ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173 \
  pothole-reporter-backend
```

Verify health check:
```bash
curl http://localhost:8080/api/health
```

Expected response:
```json
{
  "status": "ok",
  "model_name": "pothole-yolov8",
  "classes": ["Pothole"],
  "device": "cpu",
  "version": "2.0.0"
}
```

---

## 3. Google Cloud Run Deployment

### Recommended Target Specification
- **Region:** `asia-south1` (Mumbai)
- **CPU:** `2 vCPU`
- **Memory:** `4 GiB` (PyTorch + YOLOv8 inference requirement)
- **Concurrency:** Request-based billing
- **Instance limits:** Min 0, Max 1 (cost control)

### Required Environment Variables
Set these variables in the Cloud Run service configuration (preferably via Google Secret Manager for credentials):

| Variable | Required | Description |
|---|---|---|
| `PORT` | Auto | Injected automatically by Cloud Run; Uvicorn binds to `0.0.0.0:${PORT}` |
| `SUPABASE_URL` | **Yes** | Your Supabase project URL (`https://<project-id>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | **Yes** | Supabase administrative service-role secret key (`SUPABASE_SERVICE_ROLE_KEY` also supported as fallback) |
| `ALLOWED_ORIGINS` | **Yes** | Comma-separated list of allowed frontend origins (e.g. `https://<your-app>.vercel.app`) |

### Optional Environment Overrides
| Variable | Default | Description |
|---|---|---|
| `MODEL_REPO_OR_PATH` | `Samdutse/pothole-yolov8` | Hugging Face model repository |
| `MODEL_FILENAME` | `best.pt` | Model filename within the repository |
| `CONFIDENCE_THRESHOLD` | `0.25` | Minimum YOLO confidence cutoff for detections |
| `MAX_UPLOAD_SIZE_MB` | `10` | Maximum accepted payload size in MB |

---

## 4. Security & Isolation Safeguards

- **No Secrets in Image:** The Dockerfile does not accept, copy, or embed any Supabase credentials or environment files.
- **Root `.dockerignore`:** Excludes `.env`, `**/.env`, `backend/.venv/`, `backend/.pytest_cache/`, `backend/models/*.pt`, `node_modules/`, and `dist/`.
- **Offline Startup:** Because the model weights are downloaded during container build, the container requires zero external network access to initialize YOLO inference upon cold start.
