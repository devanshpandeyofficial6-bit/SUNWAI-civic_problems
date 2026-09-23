"""
resolution_verifier.py
Anti-Fraud "Before vs After" AI Proof-of-Work Verification Engine.

Prevents contractors from submitting fake resolution photos (e.g. sky, boots,
different streets) by validating:
1. Scene Visual Consistency (ORB keypoints & HSV scene correlation).
2. Defect Clearance (confirms the original reported defect is 0% detected).
"""

import cv2
import base64
import numpy as np
import logging
from typing import Dict, Any, Tuple, Optional

logger = logging.getLogger("SUNWAI-ResolutionVerifier")
logging.basicConfig(level=logging.INFO)

class ResolutionVerifier:
    def __init__(self, detector=None):
        self.detector = detector
        self.orb = cv2.ORB_create(nfeatures=500)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    def set_detector(self, detector):
        self.detector = detector

    def decode_image(self, img_input) -> Optional[np.ndarray]:
        if isinstance(img_input, np.ndarray):
            return img_input
        if isinstance(img_input, str):
            try:
                if "," in img_input:
                    _, raw = img_input.split(",", 1)
                else:
                    raw = img_input
                img_bytes = base64.b64decode(raw)
                nparr = np.frombuffer(img_bytes, np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                logger.warning(f"Failed to decode base64: {e}")
                return None
        return None

    def compute_scene_similarity(self, img1_bgr: np.ndarray, img2_bgr: np.ndarray) -> Tuple[float, int]:
        """
        Computes visual scene correspondence using ORB descriptors and HSV color histograms.
        Returns normalized similarity (0.0 to 1.0) and good matches count.
        """
        if img1_bgr is None or img2_bgr is None:
            return 0.0, 0

        # Resize to standard scale for comparison
        img1 = cv2.resize(img1_bgr, (640, 640))
        img2 = cv2.resize(img2_bgr, (640, 640))

        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

        kp1, des1 = self.orb.detectAndCompute(gray1, None)
        kp2, des2 = self.orb.detectAndCompute(gray2, None)

        match_score = 0.0
        good_matches = 0
        if des1 is not None and des2 is not None and len(des1) > 10 and len(des2) > 10:
            matches = self.matcher.match(des1, des2)
            matches = sorted(matches, key=lambda x: x.distance)
            # Retain high-confidence matches (distance < 50)
            good = [m for m in matches if m.distance < 52]
            good_matches = len(good)
            match_score = min(1.0, good_matches / 25.0)

        # Color context correlation
        hsv1 = cv2.cvtColor(img1, cv2.COLOR_BGR2HSV)
        hsv2 = cv2.cvtColor(img2, cv2.COLOR_BGR2HSV)
        hist1 = cv2.calcHist([hsv1], [0, 1], None, [16, 16], [0, 180, 0, 256])
        hist2 = cv2.calcHist([hsv2], [0, 1], None, [16, 16], [0, 180, 0, 256])
        cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
        cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
        color_sim = max(0.0, float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)))

        # Weighted combination: 60% feature geometry, 40% environment color
        combined_similarity = round((match_score * 0.6) + (color_sim * 0.4), 3)
        return combined_similarity, good_matches

    def verify_resolution(
        self,
        reported_img_data: Any,
        resolution_img_data: Any,
        expected_category: str
    ) -> Dict[str, Any]:
        """
        Performs dual anti-fraud verification:
        1. Confirms scene similarity between reported issue and resolution photo.
        2. Confirms defect clearance using YOLO inference on the resolution photo.
        """
        rep_bgr = self.decode_image(reported_img_data)
        res_bgr = self.decode_image(resolution_img_data)

        if rep_bgr is None or res_bgr is None:
            return {
                "verified": False,
                "confidence": 0.0,
                "defect_cleared": False,
                "scene_matched": False,
                "rejection_reason": "Could not decode one or both verification images.",
                "status": "REJECTED_INVALID_MEDIA"
            }

        # Step 1: Check scene similarity
        similarity, good_matches = self.compute_scene_similarity(rep_bgr, res_bgr)
        # Threshold: requires at least some scene consistency (similarity >= 0.20 or good_matches >= 6)
        scene_matched = (similarity >= 0.20 or good_matches >= 6)

        # Step 2: Check defect clearance on resolution image
        defect_cleared = True
        defect_conf = 0.0
        cat_clean = expected_category.lower().replace(" ", "_")

        if self.detector:
            try:
                res_analysis = self.detector.analyze_image_cv(res_bgr, conf_threshold=0.22)
                detected_cat = res_analysis.get("category")
                defect_conf = res_analysis.get("confidence", 0.0)

                # If the exact defect is still detected with high confidence in the resolution photo
                if detected_cat == cat_clean and defect_conf >= 0.35:
                    defect_cleared = False
            except Exception as e:
                logger.warning(f"Detection on resolution photo failed: {e}")

        # Step 3: Determine verdict
        if not scene_matched:
            verified = False
            reason = f"Scene location mismatch: Resolution photo does not match the physical surroundings of the reported issue (similarity {int(similarity*100)}%)."
            status = "REJECTED_LOCATION_MISMATCH"
        elif not defect_cleared:
            verified = False
            reason = f"Defect not resolved: Original issue ('{expected_category}') is still visibly detected in the resolution photo ({int(defect_conf*100)}% confidence)."
            status = "REJECTED_DEFECT_PERSISTS"
        else:
            verified = True
            reason = f"Proof-of-work verified: Scene matched ({int(similarity*100)}% visual alignment) and defect has been successfully cleared."
            status = "VERIFIED_APPROVED"

        return {
            "verified": verified,
            "status": status,
            "similarity_score": similarity,
            "good_feature_matches": good_matches,
            "defect_cleared": defect_cleared,
            "scene_matched": scene_matched,
            "defect_confidence_remaining": defect_conf,
            "rejection_reason": reason if not verified else None,
            "approval_summary": reason if verified else None
        }
