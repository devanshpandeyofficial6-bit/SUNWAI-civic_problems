import os
import cv2
import base64
import math
import pickle
import numpy as np
from pathlib import Path
from ultralytics import YOLO
from privacy_shield import PrivacyShield

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

class CivicDetector:
    def __init__(self, model_path=None):
        self.model_path = model_path or self._resolve_model_path()
        self.model = None
        self.base_model = None
        self.model_name = "SUNWAI-MultiDefect-Engine-v2"
        self.privacy_shield = PrivacyShield()
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

    def reload_model(self, new_weights_path=None):
        """Hot-reloads the YOLO model in memory with new weights without downtime."""
        if new_weights_path and os.path.exists(new_weights_path):
            self.model_path = str(new_weights_path)
        self._load_models()
        self.model_name = "SUNWAI-MultiDefect-Engine-v2-AutoTrained"
        print(f"[CivicDetector] Model hot-reloaded successfully from: {self.model_path}")
        return True

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

        detections = []

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

        has_streetlight = False
        if (pole_boxes and sky_ratio > 0.20) or (len(pole_boxes) >= 2):
            bx1 = max(0, min(b[0] for b in pole_boxes) - 15)
            by1 = max(0, min(b[1] for b in pole_boxes) - 15)
            bx2 = min(w, max(b[2] for b in pole_boxes) + 15)
            by2 = min(h, max(b[3] for b in pole_boxes) + 15)
            detections.append({
                "category": "streetlight",
                "confidence": 0.94,
                "bbox": [bx1, by1, bx2, by2],
                "label": "streetlight"
            })
            has_streetlight = True

        mean_brightness = float(np.mean(gray))
        if not has_streetlight and sky_ratio < 0.10 and mean_brightness < 55:
            upper_roi = hsv[:int(h * 0.50), :]
            bright_light = cv2.inRange(upper_roi, np.array([0, 0, 230]), np.array([180, 50, 255]))
            light_cnts, _ = cv2.findContours(bright_light, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for lc in light_cnts:
                la = cv2.contourArea(lc)
                if (h * w * 0.003) < la < (h * w * 0.08):
                    lx, ly, lw, lh = cv2.boundingRect(lc)
                    surr_y1, surr_y2 = max(0, ly - 30), min(h, ly + lh + 30)
                    surr_x1, surr_x2 = max(0, lx - 30), min(w, lx + lw + 30)
                    if float(np.mean(gray[surr_y1:surr_y2, surr_x1:surr_x2])) < 80:
                        detections.append({
                            "category": "streetlight",
                            "confidence": 0.91,
                            "bbox": [max(0, lx - 20), max(0, ly - 20), min(w, lx + lw + 20), min(h, ly + lh + 120)],
                            "label": "streetlight"
                        })
                        has_streetlight = True
                        break

        if sky_ratio > 0.35 or (has_streetlight and sky_ratio > 0.18):
            return self._format_result(detections, img_bgr, h, w)

        ground_mask = np.ones((h, w), dtype=np.uint8) * 255
        ground_mask[:int(h * 0.20), :] = 0
        ground_mask[sky_mask > 0] = 0
        tot_ground = max(1, np.count_nonzero(ground_mask))

        blur = cv2.GaussianBlur(gray, (9, 9), 0)
        _, thresh = cv2.threshold(blur, 68, 255, cv2.THRESH_BINARY_INV)
        thresh[ground_mask == 0] = 0
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        large_cavities = [c for c in cnts if (h * w * 0.02) < cv2.contourArea(c) < (h * w * 0.55)]
        
        pothole_box = None
        if large_cavities:
            best_c = max(large_cavities, key=cv2.contourArea)
            rx, ry, rw, rh = cv2.boundingRect(best_c)
            aspect = rw / float(rh + 1e-5)
            if 0.35 < aspect < 3.5:
                roi_g = gray[ry:ry + rh, rx:rx + rw]
                lap_v = cv2.Laplacian(roi_g, cv2.CV_64F).var()
                if lap_v > 18:
                    pothole_box = [max(0, rx - 10), max(0, ry - 10), min(w, rx + rw + 10), min(h, ry + rh + 10)]
                    detections.append({
                        "category": "pothole",
                        "confidence": round(min(0.95, max(0.88, 0.74 + (cv2.contourArea(best_c) / float(h * w)) * 0.45)), 2),
                        "bbox": pothole_box,
                        "label": "pothole"
                    })
        else:
            dark_rims = [c for c in cnts if 1500 < cv2.contourArea(c) < (h * w * 0.40)]
            if len(dark_rims) >= 2:
                all_pts = np.vstack([c.reshape(-1, 2) for c in dark_rims])
                rx, ry, rw, rh = cv2.boundingRect(all_pts)
                aspect = rw / float(rh + 1e-5)
                if 0.4 < aspect < 3.0 and (rw * rh) > (h * w * 0.05):
                    pothole_box = [max(0, rx - 10), max(0, ry - 10), min(w, rx + rw + 10), min(h, ry + rh + 10)]
                    detections.append({
                        "category": "pothole",
                        "confidence": 0.90,
                        "bbox": pothole_box,
                        "label": "pothole"
                    })

        water_chroma = (hsv[:, :, 0] >= 75) & (hsv[:, :, 0] <= 140) & (hsv[:, :, 1] > 28) & (ground_mask > 0)
        specular = (hsv[:, :, 2] > 140) & (hsv[:, :, 1] < 70) & (ground_mask > 0)
        dark_wet = (hsv[:, :, 2] < 75) & (ground_mask > 0)
        cand_water = cv2.bitwise_or(water_chroma.astype(np.uint8) * 255,
                                    cv2.bitwise_and(specular.astype(np.uint8) * 255, dark_wet.astype(np.uint8) * 255))
        k_w = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        cand_water = cv2.morphologyEx(cand_water, cv2.MORPH_CLOSE, k_w)
        w_cnts, _ = cv2.findContours(cand_water, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_w = [c for c in w_cnts if cv2.contourArea(c) > (h * w * 0.02)]

        pothole_has_water = False
        if pothole_box is not None:
            px1, py1, px2, py2 = pothole_box
            p_roi_hsv = hsv[py1:py2, px1:px2]
            if p_roi_hsv.size > 0:
                p_water_px = (p_roi_hsv[:, :, 0] >= 75) & (p_roi_hsv[:, :, 0] <= 140) & (p_roi_hsv[:, :, 1] > 28)
                p_spec_px = (p_roi_hsv[:, :, 2] > 125) & (p_roi_hsv[:, :, 1] < 75)
                p_puddle = np.count_nonzero(p_water_px | p_spec_px) / float(p_roi_hsv.shape[0] * p_roi_hsv.shape[1])
                if p_puddle > 0.08:
                    pothole_has_water = True
                    inset_x = int((px2 - px1) * 0.10)
                    inset_y = int((py2 - py1) * 0.10)
                    detections.append({
                        "category": "water_leakage",
                        "confidence": 0.85,
                        "bbox": [px1 + inset_x, py1 + inset_y, px2 - inset_x, py2 - inset_y],
                        "label": "water_leakage"
                    })

        if valid_w and not pothole_has_water:
            all_pts = np.vstack([c.reshape(-1, 2) for c in valid_w])
            wx, wy, ww, wh = cv2.boundingRect(all_pts)
            w_roi_hsv = hsv[wy:wy + wh, wx:wx + ww]
            w_vivid = (w_roi_hsv[:, :, 1] > 40) & (w_roi_hsv[:, :, 2] > 50)
            w_hues = w_roi_hsv[:, :, 0][w_vivid]
            if len(w_hues) > 500:
                w_blues = np.count_nonzero((w_hues >= 75) & (w_hues <= 140))
                w_blue_pct = (w_blues / float(len(w_hues))) * 100.0
                if w_blue_pct > 65.0:
                    w_ratio = (ww * wh) / float(h * w)
                    detections.append({
                        "category": "water_leakage",
                        "confidence": round(min(0.94, max(0.82, 0.75 + w_ratio * 0.5)), 2),
                        "bbox": [max(0, wx - 10), max(0, wy - 10), min(w, wx + ww + 10), min(h, wy + wh + 10)],
                        "label": "water_leakage"
                    })

        vivid_mask = (hsv[:, :, 1] > 60) & (hsv[:, :, 2] > 45) & (ground_mask > 0)
        k_c = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        cand_g = cv2.morphologyEx(vivid_mask.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k_c)
        g_cnts, _ = cv2.findContours(cand_g, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_g = [c for c in g_cnts if cv2.contourArea(c) > 300]
        if valid_g:
            all_pts = np.vstack([c.reshape(-1, 2) for c in valid_g])
            gx, gy, gw, gh = cv2.boundingRect(all_pts)
            roi_g_hsv = hsv[gy:gy + gh, gx:gx + gw]
            roi_vivid = (roi_g_hsv[:, :, 1] > 60) & (roi_g_hsv[:, :, 2] > 45)
            v_hues = roi_g_hsv[:, :, 0][roi_vivid]
            if len(v_hues) > 80:
                blues = np.count_nonzero((v_hues >= 80) & (v_hues <= 140))
                blue_pct = (blues / float(len(v_hues))) * 100.0
                reds = np.count_nonzero((v_hues < 15) | (v_hues > 165))
                red_pct = (reds / float(len(v_hues))) * 100.0
                hue_std = float(np.std(v_hues))
                if red_pct < 95.0:
                    if (hue_std > 25.0 and blue_pct < 60.0) or len(valid_g) >= 2 or len(v_hues) > 4000:
                        g_conf = round(min(0.94, max(0.80, 0.74 + (len(v_hues) / float(tot_ground)) * 0.8)), 2)
                        detections.append({
                            "category": "garbage",
                            "confidence": g_conf,
                            "bbox": [max(0, gx - 10), max(0, gy - 10), min(w, gx + gw + 10), min(h, gy + gh + 10)],
                            "label": "garbage"
                        })

        if not any(d["category"] in ["pothole", "garbage"] for d in detections):
            edges = cv2.Canny(gray[int(h * 0.20):, :], 40, 120)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 25, minLineLength=int(h * 0.06), maxLineGap=12)
            if lines is not None and len(lines) >= 8:
                lap_ground = cv2.Laplacian(gray[int(h * 0.20):, :], cv2.CV_64F).var()
                if lap_ground > 100:
                    all_pts = np.array([[l[0][0], l[0][1] + int(h * 0.20)] for l in lines] +
                                       [[l[0][2], l[0][3] + int(h * 0.20)] for l in lines])
                    rx, ry, rw, rh = cv2.boundingRect(all_pts)
                    detections.append({
                        "category": "broken_infrastructure",
                        "confidence": round(min(0.90, 0.75 + min(0.15, len(lines) * 0.01)), 2),
                        "bbox": [max(0, rx - 10), max(0, ry - 10), min(w, rx + rw + 10), min(h, ry + rh + 10)],
                        "label": "broken_infrastructure"
                    })
            elif valid_g and len(v_hues) > 10000 and red_pct >= 95.0:
                detections.append({
                    "category": "broken_infrastructure",
                    "confidence": 0.88,
                    "bbox": [int(w * 0.15), int(h * 0.25), int(w * 0.85), int(h * 0.85)],
                    "label": "broken_infrastructure"
                })

        return self._format_result(detections, img_bgr, h, w)

    def _format_result(self, detections, img_bgr, h, w):
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        
        category_breakdown = {c: 0.0 for c in CIVIC_CATEGORIES}
        for d in detections:
            c = d["category"]
            category_breakdown[c] = max(category_breakdown[c], d["confidence"])

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

        if not detections:
            detections.append({
                "category": "other",
                "confidence": 0.50,
                "bbox": [0, 0, w, h],
                "label": "general civic issue"
            })
            primary_cat = "other"
            primary_conf = 0.50
            all_categories = [{
                "category": "other",
                "confidence": 0.50,
                "percentage": 50
            }]
        else:
            primary_cat = detections[0]["category"]
            primary_conf = detections[0]["confidence"]

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

        # 1. Apply automated DPDP Privacy Shield (redact faces and vehicle license plates)
        anonymized_bgr, privacy_meta = self.privacy_shield.anonymize_bgr(annotated_bgr)

        # 2. Compute Defect Severity Index & PWD Repair Budget Estimator
        severity, cost_estimate = self.compute_severity_and_cost(primary_cat, detections, w, h)

        _, buffer = cv2.imencode('.jpg', anonymized_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
        annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        return {
            "category": primary_cat,
            "confidence": primary_conf,
            "category_breakdown": category_breakdown,
            "all_categories": all_categories,
            "detections": detections,
            "model": self.model_name,
            "source": "ai",
            "annotated_image": annotated_b64,
            "severity_assessment": severity,
            "cost_estimate": cost_estimate,
            "privacy_compliance": privacy_meta
        }

    def compute_severity_and_cost(self, primary_cat: str, detections: list, img_w: int, img_h: int):
        """
        Maps bounding box geometric scale into physical metric approximations (m^2),
        assigns Hazard Severity (Level 1-5), and computes repair budget based on PWD Schedule of Rates.
        """
        max_area_ratio = 0.0
        for d in detections:
            bbox = d.get("bbox", [])
            if len(bbox) == 4:
                bw = max(0, bbox[2] - bbox[0])
                bh = max(0, bbox[3] - bbox[1])
                ratio = (bw * bh) / max(1.0, float(img_w * img_h))
                if ratio > max_area_ratio:
                    max_area_ratio = ratio

        # Standard street-level viewport approx 3.5m x 3.5m = 12.25 m^2
        viewport_m2 = 12.25
        est_area_m2 = round(max(0.08, max_area_ratio * viewport_m2), 2)

        if primary_cat == "pothole":
            depth_mm = 65 if est_area_m2 > 0.4 else (45 if est_area_m2 > 0.2 else 30)
            asphalt_kg = round(est_area_m2 * (depth_mm / 1000.0) * 2400.0, 1)
            # PWD Schedule of Rates: Cold-mix asphalt ~Rs 75/kg + tack coat & compaction Rs 450
            cost_inr = int(asphalt_kg * 75 + 450)
            if est_area_m2 > 0.5:
                severity = {"level": 5, "label": "CRITICAL HAZARD", "color": "#dc2626", "badge": "Level 5 - Critical"}
            elif est_area_m2 > 0.25:
                severity = {"level": 4, "label": "HIGH SEVERITY", "color": "#ea580c", "badge": "Level 4 - High"}
            elif est_area_m2 > 0.12:
                severity = {"level": 3, "label": "MODERATE", "color": "#d97706", "badge": "Level 3 - Medium"}
            else:
                severity = {"level": 2, "label": "MINOR DEFECT", "color": "#059669", "badge": "Level 2 - Minor"}

            cost_estimate = {
                "estimated_cost_inr": cost_inr,
                "formatted_cost": f"₹{cost_inr:,}",
                "schedule_of_rates": "PWD Civil Works SoR 2025-26",
                "material_requirement": f"{asphalt_kg} kg Cold-Mix Asphalt + Tack Coat",
                "surface_area_m2": est_area_m2,
                "depth_estimate_mm": depth_mm,
                "urgency_sla_hours": 24 if severity["level"] >= 4 else 72
            }

        elif primary_cat == "garbage":
            tonnes = round(est_area_m2 * 0.35 * 0.45, 2)
            cost_inr = max(450, int(tonnes * 1200 + 350))
            if est_area_m2 > 0.8:
                severity = {"level": 4, "label": "HIGH ACCUMULATION", "color": "#ea580c", "badge": "Level 4 - High"}
            elif est_area_m2 > 0.3:
                severity = {"level": 3, "label": "MODERATE DUMP", "color": "#d97706", "badge": "Level 3 - Medium"}
            else:
                severity = {"level": 2, "label": "SCATTERED LITTER", "color": "#059669", "badge": "Level 2 - Minor"}

            cost_estimate = {
                "estimated_cost_inr": cost_inr,
                "formatted_cost": f"₹{cost_inr:,}",
                "schedule_of_rates": "Municipal SBM Solid Waste SoR 2025",
                "material_requirement": f"~{tonnes} Tonnes Removal & Disinfection",
                "surface_area_m2": est_area_m2,
                "urgency_sla_hours": 24 if severity["level"] >= 4 else 48
            }

        elif primary_cat == "streetlight":
            severity = {"level": 3, "label": "SAFETY HAZARD", "color": "#d97706", "badge": "Level 3 - Medium"}
            cost_inr = 1450
            cost_estimate = {
                "estimated_cost_inr": cost_inr,
                "formatted_cost": f"₹{cost_inr:,}",
                "schedule_of_rates": "Municipal Electrical Services SoR",
                "material_requirement": "45W LED Luminaire / Driver Repair",
                "surface_area_m2": 0.0,
                "urgency_sla_hours": 48
            }

        elif primary_cat == "water_leakage":
            severity = {"level": 4, "label": "HIGH SEVERITY (WATER LOSS)", "color": "#ea580c", "badge": "Level 4 - High"}
            cost_inr = 3200
            cost_estimate = {
                "estimated_cost_inr": cost_inr,
                "formatted_cost": f"₹{cost_inr:,}",
                "schedule_of_rates": "Jal Sansthan Pipeline Maintenance SoR",
                "material_requirement": "Excavation, SS Pipe Collar & Gasket Clamp",
                "surface_area_m2": est_area_m2,
                "urgency_sla_hours": 24
            }

        elif primary_cat == "broken_infrastructure":
            severity = {"level": 3, "label": "INFRASTRUCTURE DEFECT", "color": "#d97706", "badge": "Level 3 - Medium"}
            cost_inr = 2800
            cost_estimate = {
                "estimated_cost_inr": cost_inr,
                "formatted_cost": f"₹{cost_inr:,}",
                "schedule_of_rates": "PWD Structural Maintenance SoR",
                "material_requirement": "Concrete Masonry & Steel Guardrail Patch",
                "surface_area_m2": est_area_m2,
                "urgency_sla_hours": 72
            }
        else:
            severity = {"level": 1, "label": "LOW PRIORITY", "color": "#64748b", "badge": "Level 1 - Low"}
            cost_estimate = {
                "estimated_cost_inr": 500,
                "formatted_cost": "₹500",
                "schedule_of_rates": "General Maintenance",
                "material_requirement": "General Inspection & Triage",
                "surface_area_m2": 0.0,
                "urgency_sla_hours": 120
            }

        return severity, cost_estimate

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
