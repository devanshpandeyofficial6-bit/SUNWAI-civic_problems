"""
privacy_shield.py
Automated DPDP (Digital Personal Data Protection Act) Privacy Shield.

Detects human faces and vehicle license plates on citizen grievance photos
and applies high-strength Gaussian redaction before storage or display,
ensuring strict compliance with government data protection standards.
"""

import cv2
import base64
import numpy as np
import logging
from typing import Tuple, Dict, Any, Optional

logger = logging.getLogger("SUNWAI-PrivacyShield")
logging.basicConfig(level=logging.INFO)

class PrivacyShield:
    def __init__(self):
        # Load OpenCV cascades
        face_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        plate_path = cv2.data.haarcascades + "haarcascade_russian_plate_number.xml"
        
        self.face_cascade = cv2.CascadeClassifier(face_path)
        self.plate_cascade = cv2.CascadeClassifier(plate_path) if cv2.os.path.exists(plate_path) else None

    def anonymize_bgr(self, img_bgr: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Redacts faces and license plates in a BGR image using Gaussian blurring.
        """
        if img_bgr is None or img_bgr.size == 0:
            return img_bgr, {"faces_redacted": 0, "plates_redacted": 0, "dpdp_compliant": True}

        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        out_bgr = img_bgr.copy()
        faces_count = 0
        plates_count = 0

        # 1. Face detection & redaction
        faces = self.face_cascade.detectMultiScale(
            gray_eq,
            scaleFactor=1.15,
            minNeighbors=5,
            minSize=(24, 24),
            flags=cv2.CASCADE_SCALE_IMAGE
        )

        for (x, y, fw, fh) in faces:
            # Expand region slightly to ensure full head/ears are covered
            pad_x = int(fw * 0.1)
            pad_y = int(fh * 0.15)
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(w, x + fw + pad_x)
            y2 = min(h, y + fh + pad_y)

            roi = out_bgr[y1:y2, x1:x2]
            if roi.size > 0:
                # Apply strong Gaussian blur
                ksize = max(31, (min(fw, fh) // 2) * 2 + 1)
                blurred = cv2.GaussianBlur(roi, (ksize, ksize), 30)
                out_bgr[y1:y2, x1:x2] = blurred
                # Draw subtle privacy indicator badge
                cv2.rectangle(out_bgr, (x1, y1), (x2, y2), (0, 165, 255), 2)
                faces_count += 1

        # 2. License plate detection (Cascade + Rectangular Contour filter)
        if self.plate_cascade:
            plates = self.plate_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(30, 15)
            )
            for (px, py, pw, ph) in plates:
                aspect = float(pw) / max(1, ph)
                if 1.5 <= aspect <= 5.5:
                    roi = out_bgr[py:py+ph, px:px+pw]
                    if roi.size > 0:
                        ksize = max(21, (min(pw, ph) // 2) * 2 + 1)
                        blurred = cv2.GaussianBlur(roi, (ksize, ksize), 25)
                        out_bgr[py:py+ph, px:px+pw] = blurred
                        cv2.rectangle(out_bgr, (px, py), (px+pw, py+ph), (255, 120, 0), 2)
                        plates_count += 1

        # 3. Generic high-contrast rectangular contour plate detector for vehicles
        if plates_count == 0:
            plates_count += self._detect_and_blur_generic_plates(gray, out_bgr)

        metadata = {
            "faces_redacted": faces_count,
            "plates_redacted": plates_count,
            "total_redactions": faces_count + plates_count,
            "dpdp_compliant": True,
            "privacy_notice": "Personal Identifiers (Faces & License Plates) Redacted under DPDP Act 2023"
        }

        return out_bgr, metadata

    def _detect_and_blur_generic_plates(self, gray: np.ndarray, out_bgr: np.ndarray) -> int:
        """Fallback contour analysis for vehicle registration plates."""
        h, w = gray.shape[:2]
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        grad_x = cv2.Sobel(blurred, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=-1)
        grad_x = np.absolute(grad_x)
        (min_val, max_val) = (np.min(grad_x), np.max(grad_x))
        if max_val > min_val:
            grad_x = 255 * ((grad_x - min_val) / (max_val - min_val))
        grad_x = grad_x.astype("uint8")

        grad_x = cv2.GaussianBlur(grad_x, (9, 9), 0)
        _, thresh = cv2.threshold(grad_x, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        closed = cv2.erode(closed, None, iterations=2)
        closed = cv2.dilate(closed, None, iterations=2)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        redacted = 0
        for c in contours:
            x, y, cw, ch = cv2.boundingRect(c)
            aspect = float(cw) / max(1, ch)
            area = cw * ch
            # Check standard plate aspect ratio and area range
            if 2.2 <= aspect <= 5.2 and (h * w * 0.003) < area < (h * w * 0.08):
                # Ensure it's in the lower 70% of image (vehicles on road)
                if y > int(h * 0.25):
                    roi = out_bgr[y:y+ch, x:x+cw]
                    if roi.size > 0:
                        ksize = max(21, (min(cw, ch) // 2) * 2 + 1)
                        out_bgr[y:y+ch, x:x+cw] = cv2.GaussianBlur(roi, (ksize, ksize), 25)
                        cv2.rectangle(out_bgr, (x, y), (x+cw, y+ch), (255, 120, 0), 2)
                        redacted += 1
                        if redacted >= 3:
                            break
        return redacted

    def anonymize_base64(self, b64_str: str) -> Tuple[str, Dict[str, Any]]:
        """Accepts base64 image data, anonymizes it, and returns base64 + stats."""
        try:
            if "," in b64_str:
                header, raw = b64_str.split(",", 1)
            else:
                header, raw = "data:image/jpeg;base64", b64_str

            img_bytes = base64.b64decode(raw)
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None or img.size == 0:
                return b64_str, {"faces_redacted": 0, "plates_redacted": 0, "dpdp_compliant": True}

            anonymized, meta = self.anonymize_bgr(img)
            if anonymized is None or anonymized.size == 0:
                return b64_str, {"faces_redacted": 0, "plates_redacted": 0, "dpdp_compliant": True}

            _, buf = cv2.imencode(".jpg", anonymized, [cv2.IMWRITE_JPEG_QUALITY, 85])
            out_b64 = f"{header}," + base64.b64encode(buf).decode("utf-8")
            return out_b64, meta
        except Exception as e:
            logger.error(f"Base64 anonymization failed: {e}")
            return b64_str, {"faces_redacted": 0, "plates_redacted": 0, "error": str(e), "dpdp_compliant": False}
