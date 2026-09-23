"""
dataset_api_client.py
Universal Remote Dataset API Streaming Client for SUNWAI.

Fetches training data on-demand from remote APIs (Custom REST, Supabase,
Roboflow, or Hugging Face) into an ephemeral stream cache, eliminating
the need to store heavy image datasets inside the repository.
"""

import os
import shutil
import logging
import requests
import cv2
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger("SUNWAI-DatasetAPI")
logging.basicConfig(level=logging.INFO)

ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_STREAM_CACHE = ROOT_DIR / "tmp_stream_cache"

CIVIC_CATEGORIES = [
    "pothole",
    "streetlight",
    "garbage",
    "water_leakage",
    "broken_infrastructure"
]

CATEGORY_TO_IDX = {cat: i for i, cat in enumerate(CIVIC_CATEGORIES)}

class DatasetApiClient:
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or DEFAULT_STREAM_CACHE
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def cleanup_cache(self):
        """Purges ephemeral cache after training to prevent disk bloat."""
        if self.cache_dir.exists():
            try:
                shutil.rmtree(self.cache_dir)
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                logger.info(f"[DatasetAPI] Ephemeral cache purged: {self.cache_dir}")
            except Exception as e:
                logger.warning(f"[DatasetAPI] Cache cleanup notice: {e}")

    def stream_from_rest_api(
        self,
        endpoint_url: str,
        api_key: Optional[str] = None,
        max_samples: int = 50,
        headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Streams dataset items from a custom REST / Supabase API endpoint.
        Expected JSON response format:
        {
            "items": [
                {
                    "id": "item-123",
                    "image_url": "https://...",
                    "category": "pothole",
                    "bbox": [0.45, 0.50, 0.30, 0.25]  # normalized [xc, yc, w, h] or optional
                }
            ]
        }
        """
        req_headers = headers or {}
        if api_key:
            req_headers["Authorization"] = f"Bearer {api_key}"
            req_headers["apikey"] = api_key

        logger.info(f"[DatasetAPI] Requesting dataset stream from: {endpoint_url}")
        try:
            resp = requests.get(endpoint_url, headers=req_headers, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items", data if isinstance(data, list) else [])
        except Exception as e:
            logger.error(f"[DatasetAPI] Failed to fetch from REST API: {e}")
            return {"ok": False, "error": str(e), "downloaded": 0}

        downloaded = self._download_and_format_items(items[:max_samples])
        return {
            "ok": True,
            "source": "rest_api",
            "endpoint": endpoint_url,
            "downloaded": downloaded,
            "dataset_yaml": str(self.cache_dir / "data.yaml")
        }

    def stream_from_roboflow(
        self,
        api_key: str,
        workspace: str,
        project: str,
        version: int = 1
    ) -> Dict[str, Any]:
        """
        Connects to Roboflow Universe API to pull civic datasets on the fly.
        """
        try:
            from roboflow import Roboflow
            rf = Roboflow(api_key=api_key)
            proj = rf.workspace(workspace).project(project)
            dataset = proj.version(version).download("yolov8", location=str(self.cache_dir))
            logger.info(f"[DatasetAPI] Roboflow dataset downloaded to ephemeral cache: {dataset.location}")
            return {
                "ok": True,
                "source": "roboflow",
                "location": dataset.location,
                "dataset_yaml": str(Path(dataset.location) / "data.yaml")
            }
        except ImportError:
            logger.warning("[DatasetAPI] 'roboflow' package not installed. Falling back to HTTP download.")
            return {"ok": False, "error": "roboflow package not installed. Run 'pip install roboflow'"}
        except Exception as e:
            logger.error(f"[DatasetAPI] Roboflow stream error: {e}")
            return {"ok": False, "error": str(e)}

    def stream_simulated_cloud_dataset(self, samples_per_category: int = 10) -> Dict[str, Any]:
        """
        Generates and streams an on-demand ephemeral dataset batch in memory
        when no external cloud API key is configured.
        Leaves ZERO static files in the repository.
        """
        logger.info(f"[DatasetAPI] Streaming on-demand ephemeral cloud dataset ({samples_per_category} samples/class)...")
        self._ensure_cache_structure()

        train_img_dir = self.cache_dir / "images" / "train"
        train_lbl_dir = self.cache_dir / "labels" / "train"
        val_img_dir = self.cache_dir / "images" / "val"
        val_lbl_dir = self.cache_dir / "labels" / "val"

        total_downloaded = 0
        for split, count, img_dir, lbl_dir in [
            ("train", samples_per_category, train_img_dir, train_lbl_dir),
            ("val", max(2, samples_per_category // 3), val_img_dir, val_lbl_dir)
        ]:
            for cat_idx, cat_name in enumerate(CIVIC_CATEGORIES):
                for i in range(count):
                    img, xc, yc, w, h = self._generate_sample_image(cat_idx, i)
                    file_stem = f"api_stream_{cat_name}_{split}_{i}"
                    img_path = img_dir / f"{file_stem}.jpg"
                    lbl_path = lbl_dir / f"{file_stem}.txt"

                    cv2.imwrite(str(img_path), img)
                    with open(lbl_path, "w", encoding="utf-8") as f:
                        f.write(f"{cat_idx} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                    total_downloaded += 1

        self._create_data_yaml()
        return {
            "ok": True,
            "source": "simulated_cloud_stream",
            "downloaded": total_downloaded,
            "dataset_yaml": str(self.cache_dir / "data.yaml")
        }

    def _download_and_format_items(self, items: List[Dict[str, Any]]) -> int:
        """Downloads images from remote URLs and formats YOLO annotations."""
        self._ensure_cache_structure()
        train_img_dir = self.cache_dir / "images" / "train"
        train_lbl_dir = self.cache_dir / "labels" / "train"
        val_img_dir = self.cache_dir / "images" / "val"
        val_lbl_dir = self.cache_dir / "labels" / "val"

        downloaded = 0
        for idx, item in enumerate(items):
            url = item.get("image_url") or item.get("photoUrl") or item.get("url")
            if not url:
                continue

            category = (item.get("category") or "pothole").lower().replace(" ", "_")
            cat_idx = CATEGORY_TO_IDX.get(category, 0)
            bbox = item.get("bbox") or [0.5, 0.5, 0.4, 0.4]

            is_val = (idx % 5 == 0)
            target_img_dir = val_img_dir if is_val else train_img_dir
            target_lbl_dir = val_lbl_dir if is_val else train_lbl_dir

            stem = f"stream_{idx}_{category}"
            img_path = target_img_dir / f"{stem}.jpg"
            lbl_path = target_lbl_dir / f"{stem}.txt"

            try:
                if url.startswith("http://") or url.startswith("https://"):
                    r = requests.get(url, timeout=10)
                    if r.status_code == 200:
                        with open(img_path, "wb") as f:
                            f.write(r.content)
                elif url.startswith("data:image"):
                    import base64
                    b64_data = url.split(",", 1)[1]
                    with open(img_path, "wb") as f:
                        f.write(base64.b64decode(b64_data))
                else:
                    continue

                with open(lbl_path, "w", encoding="utf-8") as f:
                    f.write(f"{cat_idx} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}\n")

                downloaded += 1
            except Exception as e:
                logger.warning(f"[DatasetAPI] Failed to stream item {idx}: {e}")

        self._create_data_yaml()
        return downloaded

    def _ensure_cache_structure(self):
        for split in ["train", "val"]:
            (self.cache_dir / "images" / split).mkdir(parents=True, exist_ok=True)
            (self.cache_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    def _create_data_yaml(self):
        cache_path_str = str(self.cache_dir).replace('\\', '/')
        yaml_content = f"""path: {cache_path_str}
train: images/train
val: images/val
names:
  0: pothole
  1: streetlight
  2: garbage
  3: water_leakage
  4: broken_infrastructure
"""
        with open(self.cache_dir / "data.yaml", "w", encoding="utf-8") as f:
            f.write(yaml_content)

    def _generate_sample_image(self, cat_idx: int, var: int):
        """Generates realistic lightweight synthetic frames on the fly."""
        img = np.full((640, 640, 3), 80, dtype=np.uint8)
        xc, yc, w, h = 0.50, 0.50, 0.35, 0.30
        noise = np.random.randint(-15, 15, (640, 640, 3), dtype=np.int16)
        img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        if cat_idx == 0:  # pothole
            cv2.ellipse(img, (320, 340), (120, 80), (var * 20) % 180, 0, 360, (25, 25, 25), -1)
            xc, yc, w, h = 0.50, 0.53, 0.38, 0.25
        elif cat_idx == 1:  # streetlight
            cv2.rectangle(img, (305, 120), (335, 640), (45, 45, 45), -1)
            cv2.circle(img, (320, 110), 30, (240, 230, 180), -1)
            xc, yc, w, h = 0.50, 0.59, 0.15, 0.82
        elif cat_idx == 2:  # garbage
            for _ in range(15):
                rx, ry = np.random.randint(220, 420), np.random.randint(320, 500)
                col = [(40, 180, 50), (220, 40, 30), (50, 200, 220)][_ % 3]
                cv2.circle(img, (rx, ry), np.random.randint(10, 25), col, -1)
            xc, yc, w, h = 0.50, 0.64, 0.35, 0.28
        elif cat_idx == 3:  # water leakage
            cv2.ellipse(img, (320, 360), (140, 90), 0, 0, 360, (190, 170, 150), -1)
            xc, yc, w, h = 0.50, 0.56, 0.44, 0.28
        else:  # broken infrastructure
            cv2.line(img, (180, 450), (460, 220), (220, 220, 220), 16)
            xc, yc, w, h = 0.50, 0.52, 0.44, 0.36

        return img, xc, yc, w, h
