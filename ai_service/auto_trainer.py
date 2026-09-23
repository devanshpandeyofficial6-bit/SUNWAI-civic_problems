"""
auto_trainer.py
Autonomous Continuous Learning & Self-Improvement Engine for SUNWAI.

Manages verified complaint feedback from citizens/officers, connects to remote
dataset APIs on demand, fine-tunes the YOLO model in the background, and hot-reloads
the active detector without downtime or local file bloat.
"""

import os
import time
import json
import shutil
import threading
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from ultralytics import YOLO

from dataset_api_client import DatasetApiClient, CIVIC_CATEGORIES, CATEGORY_TO_IDX

logger = logging.getLogger("SUNWAI-AutoTrainer")
logging.basicConfig(level=logging.INFO)

ROOT_DIR = Path(__file__).resolve().parent
MODELS_DIR = ROOT_DIR / "models"
HISTORY_FILE = MODELS_DIR / "training_history.json"
ACTIVE_WEIGHTS = ROOT_DIR / "civic_yolo.pt"
BASE_WEIGHTS = ROOT_DIR / "yolov8n.pt"

class CivicAutoTrainer:
    def __init__(self, detector_instance=None, retrain_threshold: int = 10):
        self.detector = detector_instance
        self.retrain_threshold = retrain_threshold
        self.feedback_buffer: List[Dict[str, Any]] = []
        self.is_training: bool = False
        self.current_training_status: str = "idle"
        self.lock = threading.Lock()
        self.api_client = DatasetApiClient()

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        self.history = self._load_history()

    def set_detector(self, detector):
        self.detector = detector

    def _load_history(self) -> Dict[str, Any]:
        if HISTORY_FILE.exists():
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read training history: {e}")

        default_history = {
            "model_generation": 1,
            "total_samples_trained": 40,
            "last_trained_at": None,
            "sessions": []
        }
        self._save_history(default_history)
        return default_history

    def _save_history(self, history: Dict[str, Any]):
        try:
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save training history: {e}")

    def add_verified_feedback(
        self,
        image_data: str,
        category: str,
        report_id: Optional[str] = None,
        bbox: Optional[List[float]] = None
    ) -> Dict[str, Any]:
        """
        Registers a confirmed/verified report into the continuous learning buffer.
        Triggers auto-training when threshold is reached.
        """
        clean_cat = (category or "other").lower().replace(" ", "_")
        if clean_cat not in CATEGORY_TO_IDX:
            logger.warning(f"[AutoTrainer] Skipping unknown category: {clean_cat}")
            return {"accepted": False, "reason": f"Unknown category: {clean_cat}"}

        with self.lock:
            sample = {
                "id": report_id or f"fb-{int(time.time()*1000)}",
                "image_data": image_data,
                "category": clean_cat,
                "bbox": bbox or [0.5, 0.5, 0.4, 0.4],
                "added_at": datetime.utcnow().isoformat()
            }
            self.feedback_buffer.append(sample)
            buffer_size = len(self.feedback_buffer)
            logger.info(f"[AutoTrainer] Verified feedback logged: {sample['id']} ({clean_cat}). Buffer: {buffer_size}/{self.retrain_threshold}")

            should_trigger = (buffer_size >= self.retrain_threshold and not self.is_training)

        if should_trigger:
            logger.info("[AutoTrainer] Retraining threshold reached! Launching autonomous improvement loop...")
            self.trigger_async_retraining(reason="threshold_reached")

        return {
            "accepted": True,
            "buffer_count": buffer_size,
            "threshold": self.retrain_threshold,
            "auto_training_triggered": should_trigger
        }

    def trigger_async_retraining(self, reason: str = "manual_trigger", stream_source: str = "simulated", api_params: Optional[Dict[str, Any]] = None) -> bool:
        """Launches retraining in a background thread."""
        with self.lock:
            if self.is_training:
                logger.warning("[AutoTrainer] Training already in progress. Ignoring trigger.")
                return False
            self.is_training = True
            self.current_training_status = f"Retraining triggered ({reason}). Preparing stream..."

        thread = threading.Thread(
            target=self._run_training_pipeline,
            args=(reason, stream_source, api_params or {}),
            daemon=True
        )
        thread.start()
        return True

    def _run_training_pipeline(self, reason: str, stream_source: str, api_params: Dict[str, Any]):
        """Runs the continuous improvement pipeline in the background."""
        start_time = time.time()
        logger.info(f"[AutoTrainer] Continuous training pipeline started (Reason: {reason})")
        
        try:
            self.current_training_status = "Streaming dataset batch via API into ephemeral cache..."
            
            # 1. Fetch training stream into ephemeral cache
            if stream_source == "rest_api" and "endpoint_url" in api_params:
                stream_res = self.api_client.stream_from_rest_api(
                    endpoint_url=api_params["endpoint_url"],
                    api_key=api_params.get("api_key"),
                    max_samples=api_params.get("max_samples", 50)
                )
            elif stream_source == "roboflow" and "api_key" in api_params:
                stream_res = self.api_client.stream_from_roboflow(
                    api_key=api_params["api_key"],
                    workspace=api_params["workspace"],
                    project=api_params["project"],
                    version=api_params.get("version", 1)
                )
            else:
                stream_res = self.api_client.stream_simulated_cloud_dataset(samples_per_category=8)

            if not stream_res.get("ok"):
                raise RuntimeError(f"Dataset streaming failed: {stream_res.get('error')}")

            data_yaml_path = stream_res["dataset_yaml"]

            # 2. Append newly verified feedback samples from memory into the stream
            with self.lock:
                verified_batch = list(self.feedback_buffer)
            
            if verified_batch:
                self.current_training_status = f"Merging {len(verified_batch)} verified ground-truth samples..."
                self._inject_feedback_into_cache(verified_batch)

            # 3. Perform YOLO fine-tuning
            self.current_training_status = "Fine-tuning YOLO model weights..."
            weights_to_load = str(ACTIVE_WEIGHTS if ACTIVE_WEIGHTS.exists() else BASE_WEIGHTS)
            logger.info(f"[AutoTrainer] Loading weights: {weights_to_load}")
            
            model = YOLO(weights_to_load)
            
            epochs = api_params.get("epochs", 3)
            runs_dir = ROOT_DIR / "runs"
            
            results = model.train(
                data=data_yaml_path,
                epochs=epochs,
                imgsz=640,
                project=str(runs_dir),
                name="civic_continuous",
                exist_ok=True,
                verbose=False
            )

            # 4. Safe Model Checkpointing & Promotion
            best_weights = runs_dir / "civic_continuous" / "weights" / "best.pt"
            last_weights = runs_dir / "civic_continuous" / "weights" / "last.pt"
            
            candidate_weights = best_weights if best_weights.exists() else last_weights
            if candidate_weights.exists():
                shutil.copy(str(candidate_weights), str(ACTIVE_WEIGHTS))
                logger.info(f"[AutoTrainer] Successfully promoted updated weights to: {ACTIVE_WEIGHTS}")
            else:
                model.save(str(ACTIVE_WEIGHTS))

            # 5. Hot-reload model into active detector (zero downtime!)
            if self.detector and hasattr(self.detector, "reload_model"):
                self.current_training_status = "Hot-reloading active model..."
                self.detector.reload_model(str(ACTIVE_WEIGHTS))
                logger.info("[AutoTrainer] Active CivicDetector reloaded with fine-tuned model.")

            # 6. Flush feedback buffer & update history
            with self.lock:
                # Remove verified samples that were incorporated
                self.feedback_buffer = self.feedback_buffer[len(verified_batch):]

            elapsed = round(time.time() - start_time, 2)
            self.history["model_generation"] += 1
            self.history["total_samples_trained"] += (stream_res.get("downloaded", 0) + len(verified_batch))
            self.history["last_trained_at"] = datetime.utcnow().isoformat()
            self.history["sessions"].append({
                "generation": self.history["model_generation"],
                "reason": reason,
                "stream_source": stream_source,
                "samples_trained": stream_res.get("downloaded", 0) + len(verified_batch),
                "verified_feedback_count": len(verified_batch),
                "duration_seconds": elapsed,
                "timestamp": self.history["last_trained_at"]
            })
            self._save_history(self.history)

            logger.info(f"[AutoTrainer] Autonomous improvement complete in {elapsed}s! Generation: {self.history['model_generation']}")
            self.current_training_status = f"Completed successfully (Generation {self.history['model_generation']})"

        except Exception as e:
            logger.error(f"[AutoTrainer] Retraining pipeline failed: {e}", exc_info=True)
            self.current_training_status = f"Failed: {str(e)}"
        finally:
            # 7. Ephemeral cleanup: Purge streamed images from disk
            self.api_client.cleanup_cache()
            with self.lock:
                self.is_training = False

    def _inject_feedback_into_cache(self, feedback_items: List[Dict[str, Any]]):
        """Writes feedback items into ephemeral cache for the current training run."""
        cache_train_imgs = self.api_client.cache_dir / "images" / "train"
        cache_train_lbls = self.api_client.cache_dir / "labels" / "train"
        
        for idx, item in enumerate(feedback_items):
            cat_idx = CATEGORY_TO_IDX.get(item["category"], 0)
            bbox = item.get("bbox") or [0.5, 0.5, 0.4, 0.4]
            fname = f"feedback_{idx}_{item['id']}"
            
            img_path = cache_train_imgs / f"{fname}.jpg"
            lbl_path = cache_train_lbls / f"{fname}.txt"
            
            # Save image
            img_data = item.get("image_data", "")
            if img_data.startswith("data:image"):
                import base64
                raw = base64.b64decode(img_data.split(",", 1)[1])
                with open(img_path, "wb") as f:
                    f.write(raw)
            elif img_data.startswith("http"):
                import requests
                try:
                    r = requests.get(img_data, timeout=10)
                    if r.status_code == 200:
                        with open(img_path, "wb") as f:
                            f.write(r.content)
                except Exception:
                    continue
            else:
                continue

            with open(lbl_path, "w", encoding="utf-8") as f:
                f.write(f"{cat_idx} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}\n")

    def get_status(self) -> Dict[str, Any]:
        """Returns the current training and learning metrics."""
        with self.lock:
            return {
                "is_training": self.is_training,
                "current_status": self.current_training_status,
                "model_generation": self.history.get("model_generation", 1),
                "total_samples_trained": self.history.get("total_samples_trained", 40),
                "verified_buffer_count": len(self.feedback_buffer),
                "retrain_threshold": self.retrain_threshold,
                "last_trained_at": self.history.get("last_trained_at"),
                "recent_sessions": self.history.get("sessions", [])[-5:],
            }
