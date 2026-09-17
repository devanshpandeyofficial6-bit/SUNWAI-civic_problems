'use strict';

/**
 * End-to-End Test Suite for SUNWAI AI Civic Detection & Duplicate Integration
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, pathName, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${pathName}`);
    const postData = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: postData
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
          } catch (e) {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting SUNWAI AI & Duplicate Aggregation Test Suite');
  console.log('========================================================\n');

  // Test 1: Health endpoint
  console.log('[TEST 1] Testing /api/health...');
  const healthRes = await request('GET', '/api/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  assert.strictEqual(healthRes.body.ok, true);
  console.log('  ✓ Backend server is healthy.\n');

  // Test 2: AI Status endpoint
  console.log('[TEST 2] Testing /api/ai/status...');
  const aiStatusRes = await request('GET', '/api/ai/status');
  assert.strictEqual(aiStatusRes.status, 200);
  const isAiOnline = Boolean(aiStatusRes.body.online);
  assert.strictEqual(aiStatusRes.body.threshold, 0.70, 'AI Confidence threshold must be 0.70');
  if (isAiOnline) {
    console.log(`  ✓ AI Service is ONLINE (Model: ${aiStatusRes.body.model}, Threshold: ${aiStatusRes.body.threshold}).\n`);
  } else {
    console.log('  ℹ️  AI Service is offline. Testing with resilient manual-triage fallback.\n');
  }

  // Sample image for tests
  const sampleImagePath = path.join(__dirname, '..', 'ai_service', 'civic_dataset', 'images', 'train', 'pothole_asphalt_train.jpg');
  const sampleImageBuf = fs.readFileSync(sampleImagePath);
  const sampleBase64 = 'data:image/jpeg;base64,' + sampleImageBuf.toString('base64');

  // Test 3: AI Analysis Endpoint
  console.log('[TEST 3] Testing /api/ai/analyze...');
  const analyzeRes = await request('POST', '/api/ai/analyze', {
    photoBase64: sampleBase64,
    filename: 'pothole_road.jpg',
  });
  assert.strictEqual(analyzeRes.status, 200);
  assert.strictEqual(analyzeRes.body.ok, true);
  const aiResult = analyzeRes.body.classification;
  if (isAiOnline) {
    assert.strictEqual(aiResult.available, true);
    assert.strictEqual(aiResult.category, 'pothole');
    assert(aiResult.confidence >= 0.70, `Confidence ${aiResult.confidence} should be >= 0.70`);
    assert(Array.isArray(aiResult.detections), 'Detections should be an array');
    assert(aiResult.detections.length > 0, 'At least 1 detection bounding box expected');
    assert(Array.isArray(aiResult.detections[0].bbox) && aiResult.detections[0].bbox.length === 4, 'BBox must have 4 coordinates');
    console.log(`  ✓ AI detected: "${aiResult.category}" with ${Math.round(aiResult.confidence * 100)}% confidence.`);
    console.log(`  ✓ Localized bbox: [${aiResult.detections[0].bbox.join(', ')}].\n`);
  } else {
    assert.strictEqual(aiResult.available, false);
    console.log('  ✓ Graceful fallback verified: classification.available === false.\n');
  }

  // Generate unique test coordinates for this test run to ensure idempotency
  const offset = ((Date.now() % 10000) / 10000) * 0.1;
  const baseLat = 26.4800 + offset;
  const baseLng = 80.3200 + offset;

  // Test 4: Creating a canonical grievance with real AI detection & citizen identity
  console.log(`[TEST 4] Filing canonical grievance at lat: ${baseLat.toFixed(4)}, lng: ${baseLng.toFixed(4)}...`);
  const create1 = await request('POST', '/api/reports', {
    lat: baseLat,
    lng: baseLng,
    description: 'Deep road crater causing traffic bottleneck on 80-Feet Road',
    photoBase64: sampleBase64,
    filename: 'pothole_crater.jpg',
    providedCategory: 'pothole',
    userId: 'citizen-alice-101',
    citizenName: 'Alice Sharma',
    citizenPhone: '9876543210',
    citizenEmail: 'alice.sharma@example.com',
    citizenAadhaar: '2345 6789 0123',
  });
  assert.strictEqual(create1.status, 201);
  assert.strictEqual(create1.body.merged, false, 'First submission should not be merged');
  const canonicalTicket = create1.body.report;
  assert.strictEqual(canonicalTicket.category, 'pothole');
  assert.strictEqual(canonicalTicket.reportCount, 1, 'Initial report count should be 1');
  if (isAiOnline) {
    assert.strictEqual(canonicalTicket.aiClassification.category, 'pothole');
  }
  assert.ok(canonicalTicket.citizenDetails, 'citizenDetails must exist on report');
  assert.strictEqual(canonicalTicket.citizenDetails.name, 'Alice Sharma');
  assert.strictEqual(canonicalTicket.citizenDetails.phone, '9876543210');
  assert.strictEqual(canonicalTicket.citizenDetails.email, 'alice.sharma@example.com');
  assert.strictEqual(canonicalTicket.citizenDetails.aadhaar, 'XXXX-XXXX-0123', 'Aadhaar must be masked properly');
  console.log(`  ✓ Canonical Ticket Created: ${canonicalTicket.id} (Category: ${canonicalTicket.category}, Citizen Count: ${canonicalTicket.reportCount}).`);
  console.log(`  ✓ Citizen identity preserved: ${canonicalTicket.citizenDetails.name}, Phone: ${canonicalTicket.citizenDetails.phone}, Aadhaar: ${canonicalTicket.citizenDetails.aadhaar}.\n`);

  // Test 5: Second citizen submits SAME issue category ~19m away (Duplicate Proximity)
  console.log('[TEST 5] Second citizen (Bob) reports same issue ~19 meters away (within 50m radius)...');
  const create2 = await request('POST', '/api/reports', {
    lat: baseLat + 0.00015,
    lng: baseLng + 0.0001,
    description: 'Dangerous pothole near the crossing, bike nearly slipped',
    photoBase64: sampleBase64,
    filename: 'pothole_slip.jpg',
    providedCategory: 'pothole',
    userId: 'citizen-bob-202',
    citizenName: 'Bob Verma',
    citizenPhone: '9123456780',
    citizenEmail: 'bob.verma@example.com',
    citizenAadhaar: '9876 5432 1098',
  });
  assert.strictEqual(create2.status, 200, 'Merged submission should return HTTP 200');
  assert.strictEqual(create2.body.merged, true, 'Must be flagged as merged');
  assert.strictEqual(create2.body.canonicalId, canonicalTicket.id, `Must be merged into canonical ticket ${canonicalTicket.id}`);
  assert.strictEqual(create2.body.reportCount, 2, 'Report count must increment to 2 unique citizens');
  assert.strictEqual(create2.body.report.citizenSubmissions.length, 2, 'Must record 2 citizen submissions');
  const bobSub = create2.body.report.citizenSubmissions[1];
  assert.ok(bobSub.citizenDetails, 'Bob citizenDetails must exist on submission');
  assert.strictEqual(bobSub.citizenDetails.name, 'Bob Verma');
  assert.strictEqual(bobSub.citizenDetails.aadhaar, 'XXXX-XXXX-1098');
  console.log(`  ✓ Successfully merged into ${canonicalTicket.id}! Total citizen count is now: ${create2.body.reportCount}.`);
  console.log(`  ✓ Merged citizen identity captured: ${bobSub.citizenDetails.name} (Aadhaar: ${bobSub.citizenDetails.aadhaar}).\n`);

  // Test 6: Same citizen (Bob) submits again -> count should NOT double-increment
  console.log('[TEST 6] Bob clicks submit again -> verifying deduplication prevents repeat count...');
  const create2Repeat = await request('POST', '/api/reports', {
    lat: baseLat + 0.00015,
    lng: baseLng + 0.0001,
    description: 'Submitting update',
    userId: 'citizen-bob-202',
    providedCategory: 'pothole',
  });
  assert.strictEqual(create2Repeat.status, 200);
  assert.strictEqual(create2Repeat.body.reportCount, 2, 'Report count should remain 2 for the same citizen ID');
  console.log('  ✓ Deduplication verified: Citizen count correctly remains 2.\n');

  // Test 7: Third citizen (Charlie) submits same issue
  console.log('[TEST 7] Third citizen (Charlie) reports same pothole...');
  const create3 = await request('POST', '/api/reports', {
    lat: baseLat + 0.0002,
    lng: baseLng + 0.0002,
    description: 'Pothole water collection',
    userId: 'citizen-charlie-303',
    providedCategory: 'pothole',
  });
  assert.strictEqual(create3.status, 200);
  assert.strictEqual(create3.body.reportCount, 3, 'Report count must increment to 3');
  assert.strictEqual(create3.body.report.priority, 'HIGH', '3+ citizen reports on pothole escalates priority to HIGH');
  console.log(`  ✓ Ticket ${canonicalTicket.id} report count is now ${create3.body.reportCount} with priority "${create3.body.report.priority}".\n`);

  // Test 8: Different Category at Same Location must NOT be merged
  console.log('[TEST 8] Different category ("streetlight") at exact same location...');
  const createDiff = await request('POST', '/api/reports', {
    lat: baseLat,
    lng: baseLng,
    description: 'Broken streetlight on the same pole',
    providedCategory: 'streetlight',
    userId: 'citizen-dave-404',
  });
  assert.strictEqual(createDiff.status, 201, 'Must create separate ticket');
  assert.strictEqual(createDiff.body.merged, false, 'Must NOT be merged with pothole');
  assert.notStrictEqual(createDiff.body.report.id, canonicalTicket.id);
  console.log(`  ✓ Verified: Different category created distinct ticket: ${createDiff.body.report.id} (Category: ${createDiff.body.report.category}).\n`);

  // Test 9: Reports beyond 50m radius must NOT be merged
  console.log('[TEST 9] Same category ("pothole") ~2.2km away (outside 50m duplicate radius)...');
  const createFar = await request('POST', '/api/reports', {
    lat: baseLat + 0.02,
    lng: baseLng,
    description: 'Pothole in different ward area',
    providedCategory: 'pothole',
    userId: 'citizen-eve-505',
  });
  assert.strictEqual(createFar.status, 201);
  assert.strictEqual(createFar.body.merged, false);
  assert.notStrictEqual(createFar.body.report.id, canonicalTicket.id);
  console.log(`  ✓ Verified: Far report created distinct ticket: ${createFar.body.report.id}.\n`);

  // Test 10: Sorting by reportCount and priority
  console.log('[TEST 10] Testing sorting by reportCount in /api/reports...');
  const sortedReports = await request('GET', '/api/reports?sortBy=reportCount');
  assert.strictEqual(sortedReports.status, 200);
  assert(sortedReports.body[0].reportCount >= sortedReports.body[sortedReports.body.length - 1].reportCount);
  assert(sortedReports.body[0].reportCount >= 3, 'Top tickets should have >= 3 citizen reports');
  const foundCanonical = sortedReports.body.find(r => r.id === canonicalTicket.id);
  assert(foundCanonical && foundCanonical.reportCount === 3, 'Canonical ticket should have reportCount 3');
  console.log(`  ✓ Top sorted ticket is ${sortedReports.body[0].id} with ${sortedReports.body[0].reportCount} citizen reports (Canonical ${canonicalTicket.id} has ${foundCanonical.reportCount}).\n`);

  // Test 11: Trust Loop Verification flow remains functional
  console.log('[TEST 11] Verifying Trust Loop resolution & citizen verification...');
  // Move ticket to resolved
  await request('PATCH', `/api/reports/${canonicalTicket.id}/status`, { status: 'resolved' });
  const checkResolved = await request('GET', `/api/reports/${canonicalTicket.id}`);
  assert.strictEqual(checkResolved.body.status, 'resolved');
  assert.strictEqual(checkResolved.body.verification.status, 'pending');

  // Citizen confirms resolution
  const verifyRes = await request('POST', `/api/reports/${canonicalTicket.id}/verify`, {
    result: 'confirm',
    userId: 'citizen-alice-101',
  });
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyRes.body.status, 'closed');
  assert.strictEqual(verifyRes.body.verification.status, 'confirmed');
  console.log(`  ✓ Trust Loop verified: Ticket successfully closed and verified by citizen.\n`);

  console.log('========================================================');
  console.log('🎉 ALL 11 TESTS PASSED! AI & Duplicate System Verified.');
  console.log('========================================================');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
