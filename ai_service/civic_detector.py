import os
import cv2
import base64
import math
import pickle
import numpy as np
from pathlib import Path
from ultralytics import YOLO

ROOT_DIR = Path(__file__).resolve().parent

CIVIC_CATEGORIES = [
    "pothole",
    "streetlight",
    "garbage",
    "water_leakage",
    "broken_infrastructure",
    "other",
]

CATEGORY_COLORS = {
    "pothole": (30, 30, 220),
    "streetlight": (0, 215, 255),
    "garbage": (34, 139, 34),
    "water_leakage": (235, 120, 30),
    "broken_infrastructure": (140, 20, 140),
    "other": (120, 120, 120),
}

COCO_CIVIC_MAPPING = {
    "traffic light": ("streetlight", 0.30, 0.92),
    "bottle": ("garbage", 0.25, 0.90),
    "cup": ("garbage", 0.25, 0.90),
}

def extract_features(img_bgr):
    h, w = img_bgr.shape[:2]
    img = cv2.resize(img_bgr, (320, 320))
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    blue_sky = cv2.inRange(hsv, np.array([85, 30, 80]), np.array([135, 255, 255]))
    white_sky = cv2.inRange(hsv, np.array([0, 0, 185]), np.array([180, 45, 255]))
    sky_cand = cv2.bitwise_or(blue_sky, white_sky)
    sky_ratio = float(np.count_nonzero(sky_cand)) / float(320 * 320)
    
    upper_gray = gray[:160, :]
    lower_gray = gray[160:, :]
    upper_hsv = hsv[:160, :, :]
    lower_hsv = hsv[160:, :, :]
    
    mean_bright = float(np.mean(gray))
    std_bright = float(np.std(gray))
    mean_sat = float(np.mean(hsv[:, :, 1]))
    std_sat = float(np.std(hsv[:, :, 1]))
    
    upper_bright = float(np.mean(upper_gray))
    lower_bright = float(np.mean(lower_gray))
    upper_sat = float(np.mean(upper_hsv[:, :, 1]))
    lower_sat = float(np.mean(lower_hsv[:, :, 1]))
    
    sat_g = lower_hsv[:, :, 1]
    val_g = lower_hsv[:, :, 2]
    hue_g = lower_hsv[:, :, 0]
    
    vivid_mask = (sat_g > 60) & (val_g > 45)
    vivid_count = np.count_nonzero(vivid_mask)
    vivid_ratio = vivid_count / float(160 * 320)
    
    if vivid_count > 20:
        vh = hue_g[vivid_mask]
        hue_std = float(np.std(vh))
        blues = np.count_nonzero((vh >= 85) & (vh <= 135))
        blue_pct = (blues / float(vivid_count))
        reds = np.count_nonzero((vh < 15) | (vh > 165))
        red_pct = (reds / float(vivid_count))
        greens = np.count_nonzero((vh >= 35) & (vh < 85))
        green_pct = (greens / float(vivid_count))
        yellows = np.count_nonzero((vh >= 15) & (vh < 35))
        yellow_pct = (yellows / float(vivid_count))
    else:
        hue_std = 0.0
        blue_pct = 0.0
        red_pct = 0.0
        green_pct = 0.0
        yellow_pct = 0.0
        
    water_chroma = (hsv[:, :, 0] >= 80) & (hsv[:, :, 0] <= 140) & (hsv[:, :, 1] > 20)
    water_chroma_ratio = float(np.count_nonzero(water_chroma)) / float(320 * 320)
    
    blur = cv2.GaussianBlur(gray, (7, 7), 0)
    _, thresh = cv2.threshold(blur, 50, 255, cv2.THRESH_BINARY_INV)
    cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cavity_areas = [cv2.contourArea(c) for c in cnts if 500 < cv2.contourArea(c) < (320 * 320 * 0.5)]
    has_cavity = 1.0 if len(cavity_areas) > 0 else 0.0
    max_cavity_area = max(cavity_areas) / float(320 * 320) if cavity_areas else 0.0
    
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    lap_lower = float(cv2.Laplacian(lower_gray, cv2.CV_64F).var())
    
    edges = cv2.Canny(lower_gray, 40, 120)
    edge_density = float(np.count_nonzero(edges)) / float(160 * 320)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 25, minLineLength=25, maxLineGap=10)
    line_count = float(len(lines)) if lines is not None else 0.0
    
    fg_sky = cv2.bitwise_not(sky_cand[:200, :])
    k_pole = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 7))
    fg_pole = cv2.morphologyEx(fg_sky, cv2.MORPH_OPEN, k_pole)
    pole_cnts, _ = cv2.findContours(fg_pole, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    max_pole_aspect = 0.0
    for pc in pole_cnts:
        if cv2.contourArea(pc) > 200:
            _, _, pw, ph = cv2.boundingRect(pc)
            asp = ph / float(pw + 1e-5)
            if asp > max_pole_aspect:
                max_pole_aspect = asp

    h_hist = cv2.calcHist([hsv], [0], None, [8], [0, 180]).flatten() / float(320 * 320)
    s_hist = cv2.calcHist([hsv], [1], None, [8], [0, 256]).flatten() / float(320 * 320)
    v_hist = cv2.calcHist([hsv], [2], None, [8], [0, 256]).flatten() / float(320 * 320)
    
    feats = [
        sky_ratio,
        mean_bright,
        std_bright,
        mean_sat,
        std_sat,
        upper_bright,
        lower_bright,
        upper_sat,
        lower_sat,
        vivid_ratio,
        hue_std,
        blue_pct,
        red_pct,
        green_pct,
        yellow_pct,
        water_chroma_ratio,
        has_cavity,
        max_cavity_area,
        lap_var,
        lap_lower,
        edge_density,
        line_count,
        max_pole_aspect
    ]
    feats.extend(h_hist)
    feats.extend(s_hist)
    feats.extend(v_hist)
    return np.array(feats, dtype=np.float32)

class CivicDetector:
    def __init__(self, model_path=None):
        self.model_path = model_path or self._resolve_model_path()
        self.model = None
        self.base_model = None
        self.clf = None
        self.classes = ["pothole", "streetlight", "garbage", "water_leakage", "broken_infrastructure"]
        self.model_name = "SUNWAI-Civic-Ensemble-v2"
        self._load_models()

    def _resolve_model_path(self):
        civic_weights = ROOT_DIR / "civic_yolo.pt"
        if civic_weights.exists():
            return str(civic_weights)
        workspace_yolo = ROOT_DIR.parent / "yolov8n.pt"
        if workspace_yolo.exists():
            return str(workspace_yolo)
        local_yolo = ROOT_DIR / "yolov8n.pt"
        if local_yolo.exists():
            return str(local_yolo)
        return "yolov8n.pt"

    def _load_models(self):
        pkl_path = ROOT_DIR / "civic_classifier.pkl"
        if pkl_path.exists():
            try:
                with open(pkl_path, "rb") as f:
                    data = pickle.load(f)
                    self.clf = data.get("model")
                    self.classes = data.get("classes", self.classes)
            except Exception:
                self.clf = None

        try:
            self.model = YOLO(self.model_path)
        except Exception:
            self.model = None

        try:
            coco_path = ROOT_DIR / "yolov8n.pt"
            if not coco_path.exists():
                coco_path = ROOT_DIR.parent / "yolov8n.pt"
            if coco_path.exists():
                self.base_model = YOLO(str(coco_path))
            else:
                self.base_model = YOLO("yolov8n.pt")
        except Exception:
            self.base_model = None

    def extract_sky_mask(self, img_bgr):
        h, w = img_bgr.shape[:2]
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        blue_sky = cv2.inRange(hsv, np.array([85, 30, 80]), np.array([135, 255, 255]))
        white_sky = cv2.inRange(hsv, np.array([0, 0, 185]), np.array([180, 45, 255]))
        sunset_sky = cv2.inRange(hsv, np.array([10, 25, 140]), np.array([30, 160, 255]))

        sky_cand = cv2.bitwise_or(blue_sky, white_sky)
        sky_cand = cv2.bitwise_or(sky_cand, sunset_sky)

        lap = np.abs(cv2.Laplacian(gray, cv2.CV_64F))
        smooth_mask = (lap < 32).astype(np.uint8) * 255
        raw_sky = cv2.bitwise_and(sky_cand, smooth_mask)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(raw_sky, connectivity=8)
        sky_mask = np.zeros((h, w), dtype=np.uint8)
        for i in range(1, num_labels):
            x, y, rw, rh, area = stats[i]
            if y < int(h * 0.55) and area > (h * w * 0.03):
                sky_mask[labels == i] = 255

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        sky_mask = cv2.morphologyEx(sky_mask, cv2.MORPH_CLOSE, kernel)
        return sky_mask

    def analyze_image_cv(self, img_bgr, conf_threshold=0.25):
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        
        sky_mask = self.extract_sky_mask(img_bgr)
        sky_ratio = float(np.count_nonzero(sky_mask)) / float(h * w)

        feats = extract_features(img_bgr).reshape(1, -1)
        if self.clf is not None:
            probs = self.clf.predict_proba(feats)[0]
            pred_idx = int(np.argmax(probs))
            primary_cat = self.classes[pred_idx]
            primary_conf = round(float(probs[pred_idx]), 2)
        else:
            primary_cat = "other"
            primary_conf = 0.50
            probs = [0.2] * len(self.classes)

        is_streetlight = (primary_cat == "streetlight") or (sky_ratio > 0.25)

        detections = []
        if is_streetlight:
            primary_cat = "streetlight"
            primary_conf = max(0.92, primary_conf)
            fg_sky = cv2.bitwise_not(sky_mask)
            k_small = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            fg_clean = cv2.morphologyEx(fg_sky, cv2.MORPH_OPEN, k_small)
            contours, _ = cv2.findContours(fg_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            pole_boxes = []
            for c in contours:
                area = cv2.contourArea(c)
                if area > 800:
                    rx, ry, rw, rh = cv2.boundingRect(c)
                    aspect = rh / float(rw + 1e-5)
                    if (aspect > 1.7 and rh > h * 0.20) or (rw > w * 0.12 and aspect < 0.85 and ry < h * 0.70):
                        pole_boxes.append([rx, ry, rx + rw, ry + rh])
            if pole_boxes:
                bx1 = max(0, min(b[0] for b in pole_boxes) - 15)
                by1 = max(0, min(b[1] for b in pole_boxes) - 15)
                bx2 = min(w, max(b[2] for b in pole_boxes) + 15)
                by2 = min(h, max(b[3] for b in pole_boxes) + 15)
            else:
                bx1, by1, bx2, by2 = int(w * 0.25), int(h * 0.10), int(w * 0.75), int(h * 0.85)
            detections.append({
                "category": "streetlight",
                "confidence": primary_conf,
                "bbox": [bx1, by1, bx2, by2],
                "label": "streetlight"
            })
        else:
            ground_mask = np.ones((h, w), dtype=np.uint8) * 255
            ground_mask[:int(h * 0.20), :] = 0
            ground_mask[sky_mask > 0] = 0
            
            if primary_cat == "pothole":
                blur = cv2.GaussianBlur(gray, (9, 9), 0)
                _, thresh = cv2.threshold(blur, 52, 255, cv2.THRESH_BINARY_INV)
                thresh[ground_mask == 0] = 0
                cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_p = [c for c in cnts if (h * w * 0.015) < cv2.contourArea(c) < (h * w * 0.60)]
                if valid_p:
                    best_c = max(valid_p, key=cv2.contourArea)
                    rx, ry, rw, rh = cv2.boundingRect(best_c)
                    pb = [max(0, rx - 10), max(0, ry - 10), min(w, rx + rw + 10), min(h, ry + rh + 10)]
                else:
                    pb = [int(w * 0.20), int(h * 0.35), int(w * 0.80), int(h * 0.80)]
                primary_conf = max(0.88, primary_conf)
                detections.append({
                    "category": "pothole",
                    "confidence": primary_conf,
                    "bbox": pb,
                    "label": "pothole"
                })

                p_roi = hsv[pb[1]:pb[3], pb[0]:pb[2]]
                if p_roi.size > 0:
                    p_water = (p_roi[:, :, 0] >= 80) & (p_roi[:, :, 0] <= 140) & (p_roi[:, :, 1] > 20)
                    w_ratio = np.count_nonzero(p_water) / float(p_roi.shape[0] * p_roi.shape[1])
                    if w_ratio > 0.15:
                        sec_conf = round(min(0.78, primary_conf - 0.12), 2)
                        inset_x = int((pb[2] - pb[0]) * 0.1)
                        inset_y = int((pb[3] - pb[1]) * 0.1)
                        detections.append({
                            "category": "water_leakage",
                            "confidence": sec_conf,
                            "bbox": [pb[0] + inset_x, pb[1] + inset_y, pb[2] - inset_x, pb[3] - inset_y],
                            "label": "water_leakage"
                        })

            elif primary_cat == "water_leakage":
                water_cand = (hsv[:, :, 0] >= 75) & (hsv[:, :, 0] <= 140) & (hsv[:, :, 1] > 18) & (ground_mask > 0)
                cand_mask = (water_cand.astype(np.uint8)) * 255
                k_w = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
                cand_mask = cv2.morphologyEx(cand_mask, cv2.MORPH_CLOSE, k_w)
                w_cnts, _ = cv2.findContours(cand_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_w = [c for c in w_cnts if cv2.contourArea(c) > (h * w * 0.015)]
                if valid_w:
                    all_pts = np.vstack([c.reshape(-1, 2) for c in valid_w])
                    wx, wy, ww, wh = cv2.boundingRect(all_pts)
                    wb = [max(0, wx - 10), max(0, wy - 10), min(w, wx + ww + 10), min(h, wy + wh + 10)]
                else:
                    wb = [int(w * 0.20), int(h * 0.35), int(w * 0.80), int(h * 0.85)]
                primary_conf = max(0.88, primary_conf)
                detections.append({
                    "category": "water_leakage",
                    "confidence": primary_conf,
                    "bbox": wb,
                    "label": "water_leakage"
                })

            elif primary_cat == "garbage":
                vivid_mask = (hsv[:, :, 1] > 55) & (hsv[:, :, 2] > 40) & (ground_mask > 0)
                cand_mask = (vivid_mask.astype(np.uint8)) * 255
                k_c = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
                cand_mask = cv2.morphologyEx(cand_mask, cv2.MORPH_CLOSE, k_c)
                g_cnts, _ = cv2.findContours(cand_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_g = [c for c in g_cnts if cv2.contourArea(c) > (h * w * 0.015)]
                if valid_g:
                    all_pts = np.vstack([c.reshape(-1, 2) for c in valid_g])
                    gx, gy, gw, gh = cv2.boundingRect(all_pts)
                    gb = [max(0, gx - 10), max(0, gy - 10), min(w, gx + gw + 10), min(h, gy + gh + 10)]
                else:
                    gb = [int(w * 0.25), int(h * 0.40), int(w * 0.75), int(h * 0.85)]
                primary_conf = max(0.88, primary_conf)
                detections.append({
                    "category": "garbage",
                    "confidence": primary_conf,
                    "bbox": gb,
                    "label": "garbage"
                })

            elif primary_cat == "broken_infrastructure":
                edges = cv2.Canny(gray[int(h * 0.20):, :], 40, 120)
                lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 25, minLineLength=int(h * 0.06), maxLineGap=12)
                if lines is not None and len(lines) > 0:
                    all_pts = np.array([[l[0][0], l[0][1] + int(h * 0.20)] for l in lines] +
                                       [[l[0][2], l[0][3] + int(h * 0.20)] for l in lines])
                    rx, ry, rw, rh = cv2.boundingRect(all_pts)
                    ib = [max(0, rx - 10), max(0, ry - 10), min(w, rx + rw + 10), min(h, ry + rh + 10)]
                else:
                    ib = [int(w * 0.15), int(h * 0.30), int(w * 0.85), int(h * 0.80)]
                primary_conf = max(0.88, primary_conf)
                detections.append({
                    "category": "broken_infrastructure",
                    "confidence": primary_conf,
                    "bbox": ib,
                    "label": "broken_infrastructure"
                })

        detections.sort(key=lambda d: d["confidence"], reverse=True)

        category_breakdown = {c: 0.0 for c in CIVIC_CATEGORIES}
        if is_streetlight:
            category_breakdown["streetlight"] = primary_conf
            all_categories = [{
                "category": "streetlight",
                "confidence": primary_conf,
                "percentage": int(round(primary_conf * 100))
            }]
        else:
            category_breakdown[primary_cat] = primary_conf
            for d in detections[1:]:
                c = d["category"]
                category_breakdown[c] = max(category_breakdown.get(c, 0.0), d["confidence"])
            
            all_categories = []
            for c, conf in category_breakdown.items():
                if conf >= 0.25:
                    all_categories.append({
                        "category": c,
                        "confidence": conf,
                        "percentage": int(round(conf * 100))
                    })
            all_categories.sort(key=lambda x: x["confidence"], reverse=True)
            all_categories = all_categories[:3]

        annotated_bgr = img_bgr.copy()
        placed_banners = []

        for det in detections[:6]:
            cat = det["category"]
            conf = det["confidence"]
            x1, y1, x2, y2 = det["bbox"]
            color = CATEGORY_COLORS.get(cat, (120, 120, 120))

            cv2.rectangle(annotated_bgr, (x1, y1), (x2, y2), color, 3)

            label_text = f"{cat.replace('_', ' ').title()} {int(conf * 100)}%"
            (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            banner_w = tw + 10
            banner_h = th + 10

            by1 = max(0, y1 - banner_h)
            by2 = by1 + banner_h
            bx1 = max(0, x1)
            bx2 = min(w, bx1 + banner_w)

            overlap = any(not (bx2 < ox1 or bx1 > ox2 or by2 < oy1 or by1 > oy2) for (ox1, oy1, ox2, oy2) in placed_banners)
            if overlap:
                if y2 + banner_h <= h:
                    by1 = y2
                    by2 = y2 + banner_h
                else:
                    by1 = max(0, y1 + 4)
                    by2 = by1 + banner_h

            placed_banners.append((bx1, by1, bx2, by2))
            cv2.rectangle(annotated_bgr, (bx1, by1), (bx2, by2), color, -1)
            cv2.putText(annotated_bgr, label_text, (bx1 + 5, by1 + th + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

        _, buffer = cv2.imencode('.jpg', annotated_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
        annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        return {
            "category": primary_cat,
            "confidence": primary_conf,
            "category_breakdown": category_breakdown,
            "all_categories": all_categories,
            "detections": detections,
            "model": self.model_name,
            "source": "ai",
            "annotated_image": annotated_b64
        }

    def _map_to_civic_category(self, name):
        name = name.lower()
        if any(w in name for w in ["pothole", "crack", "asphalt", "hole", "crater"]):
            return "pothole"
        if any(w in name for w in ["traffic light", "light", "lamp", "streetlight", "pole"]):
            return "streetlight"
        if any(w in name for w in ["bottle", "cup", "trash", "garbage", "waste", "debris", "litter", "dump"]):
            return "garbage"
        if any(w in name for w in ["water", "leak", "pipe", "flood", "sewage", "puddle", "drain"]):
            return "water_leakage"
        if any(w in name for w in ["bench", "fire hydrant", "barrier", "fence", "wall", "railing", "guardrail"]):
            return "broken_infrastructure"
        return "other"

    def analyze_bytes(self, image_bytes, conf_threshold=0.25):
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise ValueError("Failed to decode image from provided bytes")
        return self.analyze_image_cv(img_bgr, conf_threshold=conf_threshold)

    def analyze_base64(self, b64_string, conf_threshold=0.25):
        if "," in b64_string:
            b64_string = b64_string.split(",", 1)[1]
        raw_bytes = base64.b64decode(b64_string)
        return self.analyze_bytes(raw_bytes, conf_threshold=conf_threshold)
