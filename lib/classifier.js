'use strict';

const http = require('http');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001';
const AI_CONFIDENCE_THRESHOLD = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.70');

const CATEGORIES = [
  'pothole',
  'streetlight',
  'garbage',
  'water_leakage',
  'broken_infrastructure',
  'other',
];

function checkAiHealth(timeoutMs = 2000) {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${AI_SERVICE_URL}/health`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve({ online: true, ...JSON.parse(data) });
              } catch (e) {
                resolve({ online: true, raw: data });
              }
            } else {
              resolve({ online: false, status: res.statusCode });
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ online: false, error: 'timeout' });
      });
      req.on('error', (err) => {
        resolve({ online: false, error: err.message });
      });
      req.end();
    } catch (e) {
      resolve({ online: false, error: e.message });
    }
  });
}

function classifyImage(imageBuffer, filename = '', timeoutMs = 7000) {
  return new Promise((resolve) => {
    if (!imageBuffer || imageBuffer.length === 0) {
      return resolve({
        category: 'other',
        confidence: 0,
        detections: [],
        model: 'none',
        source: 'manual',
        isLowConfidence: true,
        available: false,
        message: 'No photo provided for AI analysis',
      });
    }

    const base64Data = imageBuffer.toString('base64');
    const postData = JSON.stringify({
      image_base64: base64Data,
      confidence_threshold: 0.25,
    });

    try {
      const url = new URL(`${AI_SERVICE_URL}/predict`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(body);
                const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
                const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
                const detections = Array.isArray(parsed.detections) ? parsed.detections : [];

                resolve({
                  category,
                  confidence: Math.round(confidence * 100) / 100,
                  detections: detections.map((d) => ({
                    category: CATEGORIES.includes(d.category) ? d.category : 'other',
                    confidence: Math.round((d.confidence || 0) * 100) / 100,
                    bbox: d.bbox || [],
                    label: d.label || d.category || 'issue',
                  })),
                  model: parsed.model || 'YOLOv8-Civic',
                  source: 'ai',
                  isLowConfidence: confidence < AI_CONFIDENCE_THRESHOLD,
                  confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
                  annotatedImage: parsed.annotated_image || null,
                  available: true,
                  categoryBreakdown: parsed.category_breakdown || null,
                  allCategories: Array.isArray(parsed.all_categories) ? parsed.all_categories : [],
                });
              } catch (parseErr) {
                console.warn('[AI Classifier] JSON parse error from AI service:', parseErr.message);
                resolve(getOfflineFallback('AI service response error'));
              }
            } else {
              console.warn(`[AI Classifier] AI service returned status ${res.statusCode}: ${body}`);
              resolve(getOfflineFallback(`AI service error (${res.statusCode})`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        console.warn('[AI Classifier] Request timed out, using graceful fallback');
        resolve(getOfflineFallback('AI inference timed out'));
      });

      req.on('error', (err) => {
        console.warn('[AI Classifier] Connection to AI service failed:', err.message);
        resolve(getOfflineFallback('AI service unavailable'));
      });

      req.write(postData);
      req.end();
    } catch (e) {
      console.warn('[AI Classifier] Exception invoking AI service:', e.message);
      resolve(getOfflineFallback(e.message));
    }
  });
}

function getOfflineFallback(reason = 'AI service offline') {
  return {
    category: 'other',
    confidence: 0,
    detections: [],
    model: 'none',
    source: 'manual-fallback',
    isLowConfidence: true,
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    available: false,
    reason,
  };
}

function classify(imageBuffer, filename = '') {
  return {
    category: 'other',
    confidence: 0,
    detections: [],
    model: 'YOLOv8-Civic',
    source: 'pending-async-inference',
  };
}

module.exports = {
  classify,
  classifyImage,
  checkAiHealth,
  CATEGORIES,
  AI_CONFIDENCE_THRESHOLD,
  AI_SERVICE_URL,
};
