# ==============================================================================
# SUNWAI AI Inference Microservice (FastAPI + YOLO)
# ==============================================================================
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required by OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy service source code and model weights
COPY civic_detector.py ./
COPY server.py ./
COPY civic_yolo.pt ./
COPY yolov8n.pt ./

# Expose FastAPI service port
EXPOSE 5001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

# Launch microservice via uvicorn
CMD ["python", "server.py", "--port", "5001"]
