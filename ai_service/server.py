import os
import sys
import argparse
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from civic_detector import CivicDetector, CIVIC_CATEGORIES

app = FastAPI(
    title="SUNWAI Civic Issue AI Detection API",
    description="Real YOLO Object Detection Service for Civic Grievance Triage",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = None

@app.on_event("startup")
def startup_event():
    global detector
    print("[SUNWAI-AI] Initializing Civic YOLO Detector...")
    detector = CivicDetector()
    print(f"[SUNWAI-AI] Ready on {detector.model_name}!")

class PredictRequest(BaseModel):
    image_base64: str
    confidence_threshold: Optional[float] = 0.25

class DetectionItem(BaseModel):
    category: str
    confidence: float
    bbox: List[int]
    label: str

class CategoryScore(BaseModel):
    category: str
    confidence: float
    percentage: int

class PredictResponse(BaseModel):
    category: str
    confidence: float
    category_breakdown: Optional[Dict[str, float]] = None
    all_categories: Optional[List[CategoryScore]] = None
    detections: List[DetectionItem]
    model: str
    source: str
    annotated_image: Optional[str] = None

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "sunwai-ai-service",
        "model": detector.model_name if detector else "initializing",
        "supported_categories": CIVIC_CATEGORIES,
    }

@app.get("/categories")
def get_categories():
    return {
        "categories": CIVIC_CATEGORIES
    }

@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    if not detector:
        raise HTTPException(status_code=503, detail="AI Detector not initialized yet")

    try:
        result = detector.analyze_base64(request.image_base64, conf_threshold=request.confidence_threshold or 0.25)
        return result
    except Exception as e:
        print(f"[SUNWAI-AI] Predict error: {e}")
        raise HTTPException(status_code=400, detail=f"Inference error: {str(e)}")

@app.post("/predict/upload", response_model=PredictResponse)
async def predict_upload(file: UploadFile = File(...), threshold: float = Form(0.25)):
    if not detector:
        raise HTTPException(status_code=503, detail="AI Detector not initialized yet")

    try:
        contents = await file.read()
        result = detector.analyze_bytes(contents, conf_threshold=threshold)
        return result
    except Exception as e:
        print(f"[SUNWAI-AI] File inference error: {e}")
        raise HTTPException(status_code=400, detail=f"Inference error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description="SUNWAI AI Service")
    parser.add_argument("--port", type=int, default=5001, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address")
    args = parser.parse_args()

    print(f"[SUNWAI-AI] Starting service on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
