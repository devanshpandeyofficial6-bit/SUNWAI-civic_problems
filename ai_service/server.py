import os
import sys
import argparse
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from civic_detector import CivicDetector, CIVIC_CATEGORIES
from auto_trainer import CivicAutoTrainer
from resolution_verifier import ResolutionVerifier

app = FastAPI(
    title="SUNWAI Civic Issue AI Detection API",
    description="Real YOLO Object Detection Service for Civic Grievance Triage with Autonomous Learning & Privacy Shield",
    version="2.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = None
auto_trainer = None
resolution_verifier = None

@app.on_event("startup")
def startup_event():
    global detector, auto_trainer, resolution_verifier
    print("[SUNWAI-AI] Initializing Civic YOLO Detector...")
    detector = CivicDetector()
    auto_trainer = CivicAutoTrainer(detector_instance=detector, retrain_threshold=5)
    resolution_verifier = ResolutionVerifier(detector=detector)
    print(f"[SUNWAI-AI] Ready on {detector.model_name}! Autonomous Trainer & Resolution Verifier active.")

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
    severity_assessment: Optional[Dict[str, Any]] = None
    cost_estimate: Optional[Dict[str, Any]] = None
    privacy_compliance: Optional[Dict[str, Any]] = None

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

class FeedbackRequest(BaseModel):
    image_data: str  # URL or base64 data
    category: str
    report_id: Optional[str] = None
    bbox: Optional[List[float]] = None

class TrainRequest(BaseModel):
    source: Optional[str] = "simulated"  # "rest_api", "roboflow", "simulated"
    endpoint_url: Optional[str] = None
    api_key: Optional[str] = None
    workspace: Optional[str] = None
    project: Optional[str] = None
    epochs: Optional[int] = 3
    max_samples: Optional[int] = 30

@app.post("/feedback")
async def receive_feedback(request: FeedbackRequest):
    """
    Ingests confirmed/verified grievance images & categories from civic officers or citizens.
    Automatically triggers model retraining when threshold is reached.
    """
    if not auto_trainer:
        raise HTTPException(status_code=503, detail="AutoTrainer not initialized")
    
    result = auto_trainer.add_verified_feedback(
        image_data=request.image_data,
        category=request.category,
        report_id=request.report_id,
        bbox=request.bbox
    )
    return result

@app.post("/train/auto")
async def trigger_auto_train(request: Optional[TrainRequest] = None):
    """
    Triggers autonomous background fine-tuning using streaming datasets from API.
    Zero heavy images are retained on disk after training.
    """
    if not auto_trainer:
        raise HTTPException(status_code=503, detail="AutoTrainer not initialized")

    params = request.dict() if request else {}
    source = params.get("source", "simulated")
    
    success = auto_trainer.trigger_async_retraining(
        reason="api_request",
        stream_source=source,
        api_params=params
    )
    return {
        "ok": success,
        "message": "Autonomous training initiated in background" if success else "Training already in progress",
        "stream_source": source
    }

@app.get("/train/status")
async def get_train_status():
    """
    Returns live training telemetry, current generation, and dataset buffer metrics.
    """
    if not auto_trainer:
        return {"status": "initializing"}
    return auto_trainer.get_status()

@app.post("/train/cleanup")
async def cleanup_cache():
    """Manually purges temporary streaming cache."""
    if auto_trainer:
        auto_trainer.api_client.cleanup_cache()
    return {"ok": True, "message": "Ephemeral cache cleaned"}

class VerifyResolutionRequest(BaseModel):
    reported_image_base64: str
    resolution_image_base64: str
    category: str

class AnonymizeRequest(BaseModel):
    image_base64: str

@app.post("/verify-resolution")
async def verify_contractor_resolution(request: VerifyResolutionRequest):
    """
    Anti-Fraud "Before vs After" AI Proof-of-Work Verification.
    Validates that:
    1. Scene matches reported issue (visual keypoints & scene correlation).
    2. Defect is cleared (0% detection of original defect).
    """
    if not resolution_verifier:
        raise HTTPException(status_code=503, detail="ResolutionVerifier not initialized")

    result = resolution_verifier.verify_resolution(
        reported_img_data=request.reported_image_base64,
        resolution_img_data=request.resolution_image_base64,
        expected_category=request.category
    )
    return result

@app.post("/anonymize")
async def anonymize_image(request: AnonymizeRequest):
    """
    Automated DPDP Privacy Shield endpoint.
    Applies Gaussian redaction to faces and vehicle license plates.
    """
    if not detector or not hasattr(detector, "privacy_shield"):
        raise HTTPException(status_code=503, detail="PrivacyShield not initialized")

    anonymized_b64, meta = detector.privacy_shield.anonymize_base64(request.image_base64)
    return {
        "ok": True,
        "anonymized_image": anonymized_b64,
        "privacy_compliance": meta
    }



if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description="SUNWAI AI Service")
    parser.add_argument("--port", type=int, default=5001, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address")
    args = parser.parse_args()

    print(f"[SUNWAI-AI] Starting service on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
