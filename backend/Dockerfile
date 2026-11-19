FROM python:3.13-slim

# System dependencies for OpenCV, PyTorch, and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend Python dependencies (context is project root)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/app/ ./app/

# Deterministic model download configuration
# Defaults match existing codebase; revision can be overridden via --build-arg
ARG MODEL_REPO_OR_PATH=Samdutse/pothole-yolov8
ARG MODEL_FILENAME=best.pt
ARG MODEL_REVISION=main

ENV MODEL_REPO_OR_PATH=${MODEL_REPO_OR_PATH} \
    MODEL_FILENAME=${MODEL_FILENAME} \
    MODEL_REVISION=${MODEL_REVISION} \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Download the model weights at build time into /app/models/
# This ensures zero network dependence at container startup
RUN python -c "\
import os; \
from huggingface_hub import hf_hub_download; \
repo = os.environ.get('MODEL_REPO_OR_PATH', 'Samdutse/pothole-yolov8'); \
filename = os.environ.get('MODEL_FILENAME', 'best.pt'); \
revision = os.environ.get('MODEL_REVISION', 'main'); \
os.makedirs('/app/models', exist_ok=True); \
path = hf_hub_download(repo_id=repo, filename=filename, revision=revision, local_dir='/app/models'); \
print(f'Successfully downloaded model to {path}'); \
"

# Expose default Cloud Run port
EXPOSE 8080

# Start Uvicorn bound to 0.0.0.0 and dynamic $PORT provided by Cloud Run
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
