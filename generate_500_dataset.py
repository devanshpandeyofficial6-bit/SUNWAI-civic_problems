import os
import cv2
import yaml
import math
import random
import numpy as np
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DATASET_DIR = ROOT_DIR / "ai_service" / "civic_dataset"
DATA_YAML_PATH = DATASET_DIR / "data.yaml"

CATEGORIES = [
    "pothole",
    "streetlight",
    "garbage",
    "water_leakage",
    "broken_infrastructure"
]

TOTAL_PER_CATEGORY = 500
TRAIN_RATIO = 0.8
TRAIN_COUNT = int(TOTAL_PER_CATEGORY * TRAIN_RATIO)
VAL_COUNT = TOTAL_PER_CATEGORY - TRAIN_COUNT

def setup_dirs():
    for split in ["train", "val"]:
        (DATASET_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (DATASET_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    yaml_data = {
        "path": str(DATASET_DIR).replace("\\", "/"),
        "train": "images/train",
        "val": "images/val",
        "names": {i: name for i, name in enumerate(CATEGORIES)}
    }
    with open(DATA_YAML_PATH, "w", encoding="utf-8") as f:
        yaml.dump(yaml_data, f, default_flow_style=False)

def create_asphalt_canvas(w=640, h=640):
    base_val = random.randint(70, 110)
    canvas = np.full((h, w, 3), (base_val, base_val, base_val), dtype=np.uint8)
    noise = np.random.normal(0, random.uniform(10, 22), (h, w, 3)).astype(np.int16)
    canvas = np.clip(canvas.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    for _ in range(random.randint(4, 10)):
        x1, y1 = random.randint(0, w), random.randint(0, h)
        x2, y2 = x1 + random.randint(-80, 80), y1 + random.randint(-80, 80)
        col = random.randint(40, 70)
        cv2.line(canvas, (x1, y1), (x2, y2), (col, col, col), random.randint(1, 2))
    return canvas

def create_sky_street_canvas(w=640, h=640):
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    horizon = int(h * random.uniform(0.50, 0.65))
    top_col = np.array([random.randint(180, 240), random.randint(160, 210), random.randint(120, 180)])
    bot_col = np.array([random.randint(210, 255), random.randint(220, 255), random.randint(200, 240)])
    for y in range(horizon):
        t = y / horizon
        canvas[y, :] = (1 - t) * top_col + t * bot_col
    asphalt = create_asphalt_canvas(w, h - horizon)
    canvas[horizon:, :] = asphalt
    return canvas

def synth_pothole(canvas):
    h, w = canvas.shape[:2]
    cx = random.randint(int(w * 0.25), int(w * 0.75))
    cy = random.randint(int(h * 0.35), int(h * 0.80))
    rx = random.randint(40, 140)
    ry = int(rx * random.uniform(0.45, 0.85))

    pts = []
    n_pts = random.randint(14, 26)
    for k in range(n_pts):
        angle = 2 * math.pi * k / n_pts
        jitter_r = random.uniform(0.80, 1.25)
        px = int(cx + rx * math.cos(angle) * jitter_r)
        py = int(cy + ry * math.sin(angle) * jitter_r)
        pts.append([px, py])
    pts = np.array(pts, dtype=np.int32)

    darkness = random.randint(25, 45)
    cv2.fillPoly(canvas, [pts], (darkness, darkness, darkness))
    cv2.polylines(canvas, [pts], isClosed=True, color=(15, 15, 15), thickness=random.randint(2, 4))

    for _ in range(random.randint(30, 80)):
        gx = cx + random.randint(-int(rx * 0.75), int(rx * 0.75))
        gy = cy + random.randint(-int(ry * 0.75), int(ry * 0.75))
        if cv2.pointPolygonTest(pts, (float(gx), float(gy)), False) >= 0:
            gc = random.randint(70, 140)
            cv2.circle(canvas, (gx, gy), random.randint(1, 3), (gc, gc, gc), -1)

    x1, y1, bw, bh = cv2.boundingRect(pts)
    return canvas, (max(0, x1), max(0, y1), min(w, x1 + bw), min(h, y1 + bh))

def synth_water_leakage(canvas):
    h, w = canvas.shape[:2]
    cx = random.randint(int(w * 0.25), int(w * 0.75))
    cy = random.randint(int(h * 0.30), int(h * 0.85))
    rx = random.randint(60, 160)
    ry = int(rx * random.uniform(0.35, 0.70))

    pts = []
    n_pts = random.randint(16, 28)
    for k in range(n_pts):
        angle = 2 * math.pi * k / n_pts
        jitter_r = random.uniform(0.75, 1.30)
        px = int(cx + rx * math.cos(angle) * jitter_r)
        py = int(cy + ry * math.sin(angle) * jitter_r)
        pts.append([px, py])
    pts = np.array(pts, dtype=np.int32)

    overlay = canvas.copy()
    cv2.fillPoly(overlay, [pts], (random.randint(140, 210), random.randint(100, 160), random.randint(50, 110)))
    cv2.addWeighted(overlay, 0.45, canvas, 0.55, 0, canvas)

    for _ in range(random.randint(3, 8)):
        sx = cx + random.randint(-int(rx * 0.5), int(rx * 0.5))
        sy = cy + random.randint(-int(ry * 0.5), int(ry * 0.5))
        cv2.ellipse(canvas, (sx, sy), (random.randint(8, 25), random.randint(3, 8)),
                    random.randint(0, 180), 0, 360, (230, 240, 250), -1)

    x1, y1, bw, bh = cv2.boundingRect(pts)
    return canvas, (max(0, x1), max(0, y1), min(w, x1 + bw), min(h, y1 + bh))

def synth_garbage(canvas):
    h, w = canvas.shape[:2]
    cx = random.randint(int(w * 0.25), int(w * 0.75))
    cy = random.randint(int(h * 0.35), int(h * 0.85))
    rx = random.randint(50, 150)
    ry = int(rx * random.uniform(0.50, 0.85))

    palette = [
        (30, 140, 220), (20, 180, 50), (220, 220, 230),
        (50, 60, 200), (180, 80, 30), (30, 30, 30), (120, 160, 180)
    ]
    all_pts = []
    for _ in range(random.randint(18, 45)):
        ox = cx + random.randint(-rx, rx)
        oy = cy + random.randint(-ry, ry)
        col = random.choice(palette)
        shape_type = random.choice(["rect", "circle", "poly"])
        sw, sh = random.randint(10, 35), random.randint(8, 28)
        if shape_type == "rect":
            cv2.rectangle(canvas, (ox, oy), (ox + sw, oy + sh), col, -1)
            all_pts.extend([[ox, oy], [ox + sw, oy + sh]])
        elif shape_type == "circle":
            rad = random.randint(6, 18)
            cv2.circle(canvas, (ox, oy), rad, col, -1)
            all_pts.extend([[ox - rad, oy - rad], [ox + rad, oy + rad]])
        else:
            p_pts = np.array([
                [ox, oy],
                [ox + random.randint(5, 25), oy - random.randint(5, 15)],
                [ox + random.randint(15, 35), oy + random.randint(5, 20)],
                [ox - random.randint(5, 15), oy + random.randint(10, 25)]
            ], dtype=np.int32)
            cv2.fillPoly(canvas, [p_pts], col)
            all_pts.extend(p_pts.tolist())

    all_pts = np.array(all_pts, dtype=np.int32)
    x1, y1, bw, bh = cv2.boundingRect(all_pts)
    return canvas, (max(0, x1 - 5), max(0, y1 - 5), min(w, x1 + bw + 10), min(h, y1 + bh + 10))

def synth_streetlight(canvas):
    h, w = canvas.shape[:2]
    pole_x = random.randint(int(w * 0.35), int(w * 0.70))
    base_y = int(h * random.uniform(0.70, 0.95))
    top_y = int(h * random.uniform(0.12, 0.28))
    pole_w = random.randint(8, 16)
    col = (random.randint(40, 70), random.randint(40, 70), random.randint(45, 75))
    cv2.rectangle(canvas, (pole_x - pole_w // 2, top_y), (pole_x + pole_w // 2, base_y), col, -1)

    arm_dir = random.choice([-1, 1])
    arm_len = random.randint(50, 110)
    arm_end_x = pole_x + arm_dir * arm_len
    arm_end_y = top_y + random.randint(-15, 15)
    cv2.line(canvas, (pole_x, top_y + 10), (arm_end_x, arm_end_y), col, max(3, pole_w - 4))
    lum_w, lum_h = random.randint(25, 45), random.randint(12, 22)
    lx1 = min(arm_end_x, arm_end_x + arm_dir * lum_w)
    lx2 = max(arm_end_x, arm_end_x + arm_dir * lum_w)
    cv2.rectangle(canvas, (lx1, arm_end_y), (lx2, arm_end_y + lum_h), (60, 60, 60), -1)
    return canvas, (max(0, min(pole_x - pole_w // 2, lx1) - 5), max(0, min(top_y, arm_end_y) - 5), min(w, max(pole_x + pole_w // 2, lx2) + 5), min(h, base_y))

def synth_broken_infrastructure(canvas):
    h, w = canvas.shape[:2]
    cx = random.randint(int(w * 0.30), int(w * 0.70))
    cy = random.randint(int(h * 0.35), int(h * 0.75))
    bw, bh = random.randint(120, 260), random.randint(70, 160)
    x1, y1 = max(0, cx - bw // 2), max(0, cy - bh // 2)
    x2, y2 = min(w, cx + bw // 2), min(h, cy + bh // 2)
    cv2.rectangle(canvas, (x1, y1), (x2, y2), (130, 130, 130), -1)
    for _ in range(random.randint(6, 15)):
        fx, fy = random.randint(x1 + 10, x2 - 10), random.randint(y1 + 10, y2 - 10)
        cv2.line(canvas, (fx, fy), (fx + random.randint(-40, 40), fy + random.randint(-40, 40)), (25, 25, 25), random.randint(2, 4))
    return canvas, (x1, y1, x2, y2)

def to_yolo_label(bbox, img_w=640, img_h=640):
    x1, y1, x2, y2 = bbox
    cx = ((x1 + x2) / 2.0) / img_w
    cy = ((y1 + y2) / 2.0) / img_h
    w = (x2 - x1) / img_w
    h = (y2 - y1) / img_h
    return max(0.0, min(1.0, cx)), max(0.0, min(1.0, cy)), max(0.001, min(1.0, w)), max(0.001, min(1.0, h))

def generate_all():
    setup_dirs()
    print("Generating 500 samples per category (2,500 total)...")
    generators = {
        "pothole": (synth_pothole, create_asphalt_canvas),
        "water_leakage": (synth_water_leakage, create_asphalt_canvas),
        "garbage": (synth_garbage, create_asphalt_canvas),
        "streetlight": (synth_streetlight, create_sky_street_canvas),
        "broken_infrastructure": (synth_broken_infrastructure, create_asphalt_canvas),
    }

    for cat_id, cat_name in enumerate(CATEGORIES):
        gen_fn, canvas_fn = generators[cat_name]
        print(f"Creating 500 samples for [{cat_name}]...")
        for idx in range(TOTAL_PER_CATEGORY):
            split = "train" if idx < TRAIN_COUNT else "val"
            img, bbox = gen_fn(canvas_fn(640, 640))
            img_path = DATASET_DIR / "images" / split / f"{cat_name}_{idx:04d}.jpg"
            lbl_path = DATASET_DIR / "labels" / split / f"{cat_name}_{idx:04d}.txt"
            cv2.imwrite(str(img_path), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
            cx, cy, bw, bh = to_yolo_label(bbox, 640, 640)
            with open(lbl_path, "w", encoding="utf-8") as lf:
                lf.write(f"{cat_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n")

    print("All 2,500 samples generated successfully!")

if __name__ == "__main__":
    generate_all()
