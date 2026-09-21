import os
import cv2
import base64
import math
import numpy as np
from pathlib import Path
from PIL import Image
import io
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

class CivicDetector:
    def __init__(self, model_path=None):
        self.model_path = model_path or self._resolve_model_path()
        self.model = None
        self.base_model = None
        self.model_name = "YOLOv8-Civic-Ensemble"
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
            names = list(self.model.names.values())
            coco_path = "yolov8n.pt"
            local_coco = ROOT_DIR / "yolov8n.pt"
            if local_coco.exists():
                coco_path = str(local_coco)
            elif (ROOT_DIR.parent / "yolov8n.pt").exists():
                coco_path = str(ROOT_DIR.parent / "yolov8n.pt")

            if any(c in names for c in ["pothole", "garbage", "streetlight"]):
                self.model_name = "YOLOv8-Civic-FineTuned"
                try:
                    self.base_model = YOLO(coco_path)
                except Exception:
                    self.base_model = None
            else:
                self.base_model = self.model
                self.model_name = "YOLOv8-Civic-Ensemble"
        except Exception as e:
            raise

    @staticmethod
    def extract_sky_mask(img_bgr):
        h, w = img_bgr.shape[:2]
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        blue_sky = cv2.inRange(hsv, np.array([85, 20, 75]), np.array([140, 255, 255]))
        white_sky = cv2.inRange(hsv, np.array([0, 0, 155]), np.array([180, 35, 255]))
        sunset_sky = cv2.inRange(hsv, np.array([10, 30, 130]), np.array([35, 220, 255]))

        sky_cand = cv2.bitwise_or(blue_sky, white_sky)
        sky_cand = cv2.bitwise_or(sky_cand, sunset_sky)

        lap = np.abs(cv2.Laplacian(gray, cv2.CV_64F))
        smooth_mask = (lap < 32).astype(np.uint8) * 255
        raw_sky = cv2.bitwise_and(sky_cand, smooth_mask)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(raw_sky, connectivity=8)
        sky_mask = np.zeros((h, w), dtype=np.uint8)
        for i in range(1, num_labels):
            x, y, rw, rh, area = stats[i]
            if y < int(h * 0.45) and area > (h * w * 0.03):
                sky_mask[labels == i] = 255

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        sky_mask = cv2.morphologyEx(sky_mask, cv2.MORPH_CLOSE, kernel)
        return sky_mask

    def _detect_civic_visual_features(self, img_bgr, sky_mask):
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        sky_ratio = float(np.count_nonzero(sky_mask)) / float(h * w)

        found = []

        fg_sky = cv2.bitwise_not(sky_mask)
        kernel_small = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        fg_clean = cv2.morphologyEx(fg_sky, cv2.MORPH_OPEN, kernel_small)
        contours, _ = cv2.findContours(fg_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        pole_boxes = []
        for c in contours:
            area = cv2.contourArea(c)
            if area > 800:
                rx, ry, rw, rh = cv2.boundingRect(c)
                aspect = rh / float(rw + 1e-5)
                if (aspect > 1.7 and rh > h * 0.20) or (rw > w * 0.12 and aspect < 0.85 and ry < h * 0.70):
                    pole_boxes.append([rx, ry, rx + rw, ry + rh])

        if (pole_boxes and sky_ratio > 0.25) or (len(pole_boxes) >= 2):
            bx1 = max(0, min(b[0] for b in pole_boxes) - 15)
            by1 = max(0, min(b[1] for b in pole_boxes) - 15)
            bx2 = min(w, max(b[2] for b in pole_boxes) + 15)
            by2 = min(h, max(b[3] for b in pole_boxes) + 15)
            found.append({
                "category": "streetlight",
                "confidence": 0.94,
                "bbox": [bx1, by1, bx2, by2],
                "label": "streetlight"
            })

        mean_brightness = float(np.mean(gray))
        if not any(d["category"] == "streetlight" for d in found) and sky_ratio < 0.10 and mean_brightness < 55:
            upper_roi = hsv[:int(h * 0.50), :]
            bright_light = cv2.inRange(upper_roi, np.array([0, 0, 230]), np.array([180, 50, 255]))
            light_cnts, _ = cv2.findContours(bright_light, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for lc in light_cnts:
                la = cv2.contourArea(lc)
                if (h * w * 0.003) < la < (h * w * 0.08):
                    lx, ly, lw, lh = cv2.boundingRect(lc)
                    surr_y1 = max(0, ly - 30)
                    surr_y2 = min(h, ly + lh + 30)
                    surr_x1 = max(0, lx - 30)
                    surr_x2 = min(w, lx + lw + 30)
                    if float(np.mean(gray[surr_y1:surr_y2, surr_x1:surr_x2])) < 80:
                        found.append({
                            "category": "streetlight",
                            "confidence": 0.91,
                            "bbox": [max(0, lx - 20), max(0, ly - 20), min(w, lx + lw + 20), min(h, ly + lh + 120)],
                            "label": "streetlight"
                        })
                        break

        mean_sat = float(np.mean(hsv[:, :, 1]))
        is_road_scene = (mean_sat < 48) and (35 < mean_brightness < 175)

        ground_mask = np.ones((h, w), dtype=np.uint8) * 255
        ground_mask[:int(h * 0.20), :] = 0
        ground_mask[sky_mask > 0] = 0
        tot_ground = max(1, np.count_nonzero(ground_mask))

        specular = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 75, 255]))
        dark_wet = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 85]))
        water_blue = cv2.inRange(hsv, np.array([85, 65, 55]), np.array([135, 255, 255]))

        spec_g = cv2.bitwise_and(specular, ground_mask)
        wet_g = cv2.bitwise_and(dark_wet, ground_mask)
        blue_g = cv2.bitwise_and(water_blue, ground_mask)

        spec_ratio = np.count_nonzero(spec_g) / float(tot_ground)
        wet_ratio = np.count_nonzero(wet_g) / float(tot_ground)
        blue_ratio = np.count_nonzero(blue_g) / float(tot_ground)

        if is_road_scene and (spec_ratio > 0.005 or wet_ratio > 0.04):
            puddle_mask = np.zeros_like(specular)
            puddle_mask[int(h * 0.22):, :] = specular[int(h * 0.22):, :]
            k_puddle = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
            puddle_mask = cv2.morphologyEx(puddle_mask, cv2.MORPH_CLOSE, k_puddle)
            puddle_cnts, _ = cv2.findContours(puddle_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for pc in puddle_cnts:
                pa = cv2.contourArea(pc)
                px, py, pw, ph = cv2.boundingRect(pc)
                if (h * w * 0.006) < pa < (h * w * 0.20) and pw < int(w * 0.55) and ph < int(h * 0.45):
                    p_aspect = pw / float(ph + 1e-5)
                    if 0.4 < p_aspect < 4.5:
                        pad_x = int(pw * 0.08)
                        pad_y = int(ph * 0.08)
                        bx1 = max(0, px - pad_x)
                        by1 = max(0, py - pad_y)
                        bx2 = min(w, px + pw + pad_x)
                        by2 = min(h, py + ph + pad_y)
                        found.append({
                            "category": "pothole",
                            "confidence": 0.94,
                            "bbox": [bx1, by1, bx2, by2],
                            "label": "pothole"
                        })
                        water_conf = round(min(0.80, max(0.60, 0.55 + (pa / (h * w)) * 1.5 + spec_ratio * 2.5)), 2)
                        found.append({
                            "category": "water_leakage",
                            "confidence": water_conf,
                            "bbox": [bx1, by1, bx2, by2],
                            "label": "water_leakage"
                        })
                        p_roi = img_bgr[by1:by2, bx1:bx2]
                        if p_roi.size > 0:
                            p_hsv = cv2.cvtColor(p_roi, cv2.COLOR_BGR2HSV)
                            p_vivid = (p_hsv[:, :, 1] > 55) & (p_hsv[:, :, 2] > 50)
                            p_v_cnt = np.count_nonzero(p_vivid)
                            if (p_v_cnt / float(p_roi.shape[0] * p_roi.shape[1])) > 0.03 and p_v_cnt > 200:
                                p_hue = p_hsv[:, :, 0]
                                if float(np.std(p_hue[p_vivid])) > 18:
                                    found.append({
                                        "category": "garbage",
                                        "confidence": 0.68,
                                        "bbox": [bx1, by1, bx2, by2],
                                        "label": "garbage"
                                    })

        if (blue_ratio > 0.05) or (not is_road_scene and spec_ratio > 0.05 and wet_ratio > 0.08):
            cand = cv2.bitwise_or(spec_g, blue_g)
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, k)
            cnts, _ = cv2.findContours(cand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in cnts:
                a = cv2.contourArea(c)
                if (h * w * 0.02) < a < (h * w * 0.60):
                    rx, ry, rw, rh = cv2.boundingRect(c)
                    if rw / float(rh + 1e-5) >= 0.65:
                        found.append({
                            "category": "water_leakage",
                            "confidence": 0.92,
                            "bbox": [rx, ry, rx + rw, ry + rh],
                            "label": "water_leakage"
                        })

        road_mask = np.ones((h, w), dtype=np.uint8) * 255
        road_mask[:int(h * 0.25), :] = 0
        road_mask[sky_mask > 0] = 0
        blur = cv2.GaussianBlur(cv2.bitwise_and(gray, road_mask), (9, 9), 0)
        _, thresh = cv2.threshold(blur, 68, 255, cv2.THRESH_BINARY_INV)
        thresh[road_mask == 0] = 0
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            a = cv2.contourArea(c)
            if (h * w * 0.02) < a < (h * w * 0.50):
                rx, ry, rw, rh = cv2.boundingRect(c)
                aspect = rw / float(rh + 1e-5)
                if 0.4 < aspect < 3.5:
                    roi = gray[ry:ry + rh, rx:rx + rw]
                    lap_v = cv2.Laplacian(roi, cv2.CV_64F).var()
                    if lap_v > 28:
                        conf = min(0.95, max(0.75, 0.70 + (a / (h * w)) * 0.5 + min(0.15, lap_v / 1000.0)))
                        found.append({
                            "category": "pothole",
                            "confidence": round(conf, 2),
                            "bbox": [rx, ry, rx + rw, ry + rh],
                            "label": "pothole"
                        })
                        c_roi_bgr = img_bgr[ry:ry + rh, rx:rx + rw]
                        if c_roi_bgr.size > 0:
                            c_hsv = cv2.cvtColor(c_roi_bgr, cv2.COLOR_BGR2HSV)
                            c_tot = float(c_roi_bgr.shape[0] * c_roi_bgr.shape[1])
                            c_spec = cv2.inRange(c_hsv, np.array([0, 0, 160]), np.array([180, 60, 255]))
                            c_blue = cv2.inRange(c_hsv, np.array([85, 45, 50]), np.array([135, 255, 255]))
                            spec_ratio_c = np.count_nonzero(c_spec) / c_tot
                            blue_ratio_c = np.count_nonzero(c_blue) / c_tot
                            if spec_ratio_c > 0.025 or blue_ratio_c > 0.035:
                                found.append({
                                    "category": "water_leakage",
                                    "confidence": 0.72,
                                    "bbox": [rx, ry, rx + rw, ry + rh],
                                    "label": "water_leakage"
                                })
                            c_sat = c_hsv[:, :, 1]
                            c_val = c_hsv[:, :, 2]
                            c_vivid = (c_sat > 55) & (c_val > 50)
                            c_v_cnt = np.count_nonzero(c_vivid)
                            if (c_v_cnt / c_tot) > 0.03 and c_v_cnt > 200:
                                c_hue = c_hsv[:, :, 0]
                                if float(np.std(c_hue[c_vivid])) > 18:
                                    found.append({
                                        "category": "garbage",
                                        "confidence": 0.68,
                                        "bbox": [rx, ry, rx + rw, ry + rh],
                                        "label": "garbage"
                                    })

        roi_hsv = hsv[int(h * 0.18):, :]
        sat = roi_hsv[:, :, 1]
        val = roi_hsv[:, :, 2]
        hue = roi_hsv[:, :, 0]
        vivid_mask = (sat > 55) & (val > 45)
        vivid_count = np.count_nonzero(vivid_mask)
        color_ratio = vivid_count / float(sat.size)

        edges = cv2.Canny(gray[int(h * 0.18):, :], 50, 150)
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        small_cnts = [c for c in cnts if 35 < cv2.contourArea(c) < (h * w * 0.08)]

        hue_std = float(np.std(hue[vivid_mask])) if vivid_count > 50 else 0.0

        if (color_ratio > 0.07 and hue_std > 18 and len(small_cnts) >= 4) or (len(small_cnts) >= 12 and color_ratio > 0.04):
            all_pts = np.vstack([c.reshape(-1, 2) for c in small_cnts])
            rx, ry, rw, rh = cv2.boundingRect(all_pts)
            found.append({
                "category": "garbage",
                "confidence": 0.86,
                "bbox": [max(0, rx - 10), min(h, ry + int(h * 0.18)), min(w, rx + rw + 10), min(h, ry + int(h * 0.18) + rh)],
                "label": "garbage"
            })

        if not found and not is_road_scene:
            edges = cv2.Canny(gray, 40, 120)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 40, minLineLength=int(h * 0.18), maxLineGap=15)
            slanted = []
            if lines is not None:
                for l in lines:
                    x1, y1, x2, y2 = l[0]
                    dx = x2 - x1
                    dy = y2 - y1
                    angle = abs(math.atan2(dy, dx) * 180.0 / math.pi)
                    if (25 < angle < 65) or (115 < angle < 155):
                        slanted.append(l[0])

            if len(slanted) >= 4:
                all_pts = np.array([[l[0], l[1]] for l in slanted] + [[l[2], l[3]] for l in slanted])
                rx, ry, rw, rh = cv2.boundingRect(all_pts)
                if rw > int(w * 0.18) and rh > int(h * 0.18):
                    found.append({
                        "category": "broken_infrastructure",
                        "confidence": 0.82,
                        "bbox": [max(0, rx - 15), max(0, ry - 15), min(w, rx + rw + 15), min(h, ry + rh + 15)],
                        "label": "broken_infrastructure"
                    })

        return found

    def analyze_image_cv(self, img_bgr, conf_threshold=0.25):
        h, w = img_bgr.shape[:2]
        detections = []

        sky_mask = self.extract_sky_mask(img_bgr)
        sky_ratio = float(np.count_nonzero(sky_mask)) / float(h * w)

        try:
            results = self.model.predict(source=img_bgr, conf=conf_threshold, verbose=False)
            names = self.model.names
            is_direct_civic = any(c in list(names.values()) for c in ["pothole", "garbage", "streetlight"])

            if results and len(results) > 0:
                for box in results[0].boxes:
                    cls_id = int(box.cls[0].item())
                    cls_name = str(names.get(cls_id, "other")).lower()
                    conf = float(box.conf[0].item())
                    xyxy = [int(v) for v in box.xyxy[0].tolist()]

                    category = self._map_to_civic_category(cls_name)
                    if is_direct_civic and category != "other":
                        if category == "water_leakage" and xyxy[1] < int(h * 0.20):
                            continue
                        detections.append({
                            "category": category,
                            "confidence": round(conf, 2),
                            "bbox": xyxy,
                            "label": category
                        })
        except Exception as e:
            pass

        if self.base_model and self.base_model != self.model:
            try:
                base_results = self.base_model.predict(source=img_bgr, conf=0.18, verbose=False)
                if base_results and len(base_results) > 0:
                    for box in base_results[0].boxes:
                        b_cls = str(self.base_model.names.get(int(box.cls[0].item()), "")).lower()
                        b_conf = float(box.conf[0].item())
                        xyxy = [int(v) for v in box.xyxy[0].tolist()]

                        if b_cls in COCO_CIVIC_MAPPING:
                            target_cat, boost, max_conf = COCO_CIVIC_MAPPING[b_cls]
                            if target_cat == "water_leakage" and xyxy[1] < int(h * 0.20):
                                continue
                            cal_conf = round(min(max_conf, b_conf + boost), 2)
                            detections.append({
                                "category": target_cat,
                                "confidence": cal_conf,
                                "bbox": xyxy,
                                "label": target_cat
                            })
            except Exception as e:
                pass

        heuristic_detections = self._detect_civic_visual_features(img_bgr, sky_mask)
        detections.extend(heuristic_detections)

        pothole_dets = [d for d in detections if d["category"] == "pothole"]
        for pd in pothole_dets:
            px1, py1, px2, py2 = pd["bbox"]
            p_roi = img_bgr[py1:py2, px1:px2]
            if p_roi.size > 0:
                p_tot = float(p_roi.shape[0] * p_roi.shape[1])
                p_hsv = cv2.cvtColor(p_roi, cv2.COLOR_BGR2HSV)

                p_spec = cv2.inRange(p_hsv, np.array([0, 0, 130]), np.array([180, 80, 255]))
                p_blue = cv2.inRange(p_hsv, np.array([80, 35, 45]), np.array([140, 255, 255]))
                spec_r = np.count_nonzero(p_spec) / p_tot
                blue_r = np.count_nonzero(p_blue) / p_tot

                if spec_r > 0.04 or blue_r > 0.04:
                    water_conf = round(min(0.80, max(0.60, 0.55 + spec_r * 2.0 + blue_r * 1.5)), 2)
                    w_mask = cv2.bitwise_or(p_spec, p_blue)
                    k_w = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
                    w_mask = cv2.morphologyEx(w_mask, cv2.MORPH_CLOSE, k_w)
                    w_cnts, _ = cv2.findContours(w_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    w_valid = [c for c in w_cnts if cv2.contourArea(c) > 25]
                    if w_valid:
                        all_pts = np.vstack([c.reshape(-1, 2) for c in w_valid])
                        wx, wy, ww, wh = cv2.boundingRect(all_pts)
                        w_bbox = [max(0, px1 + wx - 4), max(0, py1 + wy - 4),
                                  min(w, px1 + wx + ww + 4), min(h, py1 + wy + wh + 4)]
                    else:
                        inset_x = max(6, int((px2 - px1) * 0.06))
                        inset_y = max(6, int((py2 - py1) * 0.12))
                        w_bbox = [px1 + inset_x, py1 + inset_y, px2 - inset_x, py2 - inset_x]

                    detections.append({
                        "category": "water_leakage",
                        "confidence": water_conf,
                        "bbox": w_bbox,
                        "label": "water_leakage"
                    })

                p_vivid = (p_hsv[:, :, 1] > 45) & (p_hsv[:, :, 2] > 40)
                vivid_cnt = np.count_nonzero(p_vivid)
                vivid_r = vivid_cnt / p_tot

                if vivid_r > 0.025 and vivid_cnt > 120:
                    hue_std = float(np.std(p_hsv[:, :, 0][p_vivid]))
                    if hue_std > 15:
                        garb_conf = round(min(0.78, max(0.60, 0.55 + vivid_r * 2.5)), 2)
                        g_mask = (p_vivid.astype(np.uint8)) * 255
                        k_g = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                        g_mask = cv2.morphologyEx(g_mask, cv2.MORPH_CLOSE, k_g)
                        g_cnts, _ = cv2.findContours(g_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        g_valid = [c for c in g_cnts if cv2.contourArea(c) > 20]
                        if g_valid:
                            all_g_pts = np.vstack([c.reshape(-1, 2) for c in g_valid])
                            gx, gy, gw, gh = cv2.boundingRect(all_g_pts)
                            g_bbox = [max(0, px1 + gx - 4), max(0, py1 + gy - 4),
                                      min(w, px1 + gx + gw + 4), min(h, py1 + gy + gh + 4)]
                        else:
                            inset_x = max(8, int((px2 - px1) * 0.10))
                            inset_y = max(8, int((py2 - py1) * 0.15))
                            g_bbox = [px1 + inset_x, py1 + inset_y, px2 - inset_x, py2 - inset_y]

                        detections.append({
                            "category": "garbage",
                            "confidence": garb_conf,
                            "bbox": g_bbox,
                            "label": "garbage"
                        })

        has_streetlight = any(d["category"] == "streetlight" and d["confidence"] >= 0.85 for d in detections)
        if has_streetlight and sky_ratio > 0.25:
            detections = [d for d in detections if not (d["category"] == "water_leakage" and d["bbox"][1] < int(h * 0.25))]

        has_pothole = any(d["category"] == "pothole" for d in detections)
        if has_pothole:
            max_pothole_conf = max(d["confidence"] for d in detections if d["category"] == "pothole")
            for d in detections:
                if d["category"] in ["water_leakage", "garbage"] and d["confidence"] >= max_pothole_conf:
                    d["confidence"] = round(max(0.55, max_pothole_conf - 0.14), 2)

        detections.sort(key=lambda d: d["confidence"], reverse=True)
        deduped = self._nms_detections(detections, iou_threshold=0.50)

        if deduped:
            primary_cat = deduped[0]["category"]
            primary_conf = deduped[0]["confidence"]
        else:
            primary_cat = "other"
            primary_conf = 0.50
            deduped.append({
                "category": "other",
                "confidence": 0.50,
                "bbox": [0, 0, w, h],
                "label": "general civic issue"
            })

        category_breakdown, all_categories = self._compute_all_category_scores(
            img_bgr, sky_mask, deduped, primary_cat, primary_conf
        )

        annotated_bgr = img_bgr.copy()
        placed_banners = []

        for det in deduped[:6]:
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
            "detections": deduped,
            "model": self.model_name,
            "source": "ai",
            "annotated_image": annotated_b64
        }

    def _compute_all_category_scores(self, img_bgr, sky_mask, detections, primary_cat, primary_conf):
        det_scores = {}
        for d in detections:
            cat = d.get("category")
            conf = float(d.get("confidence", 0.0))
            if cat and conf >= 0.25:
                det_scores[cat] = max(det_scores.get(cat, 0.0), conf)

        if primary_cat and primary_conf > 0:
            det_scores[primary_cat] = max(det_scores.get(primary_cat, 0.0), primary_conf)

        all_categories = []
        for cat, conf in det_scores.items():
            if conf >= 0.25:
                pct = int(round(conf * 100))
                all_categories.append({
                    "category": cat,
                    "confidence": round(conf, 2),
                    "percentage": pct
                })

        all_categories.sort(key=lambda x: x["confidence"], reverse=True)
        all_categories = all_categories[:3]

        if not all_categories and primary_cat:
            all_categories.append({
                "category": primary_cat,
                "confidence": round(primary_conf, 2),
                "percentage": int(round(primary_conf * 100))
            })

        category_breakdown = {
            c: round(det_scores.get(c, 0.0), 2)
            for c in ["pothole", "streetlight", "garbage", "water_leakage", "broken_infrastructure", "other"]
        }

        return category_breakdown, all_categories

    def _nms_detections(self, detections, iou_threshold=0.50):
        if not detections:
            return []

        keep = []
        for det in detections:
            bbox = det["bbox"]
            cat = det["category"]
            should_add = True
            for existing in keep:
                if existing["category"] == cat:
                    iou = self._compute_iou(bbox, existing["bbox"])
                    if iou > iou_threshold:
                        should_add = False
                        break
            if should_add:
                keep.append(det)
        return keep

    @staticmethod
    def _compute_iou(b1, b2):
        x1 = max(b1[0], b2[0])
        y1 = max(b1[1], b2[1])
        x2 = min(b1[2], b2[2])
        y2 = min(b1[3], b2[3])

        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = max(1, (b1[2] - b1[0]) * (b1[3] - b1[1]))
        area2 = max(1, (b2[2] - b2[0]) * (b2[3] - b2[1]))
        union = area1 + area2 - inter
        return inter / float(union)

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
