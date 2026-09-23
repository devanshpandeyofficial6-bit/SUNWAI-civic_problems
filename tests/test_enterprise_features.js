'use strict';

const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing SUNWAI Enterprise Enhancements ---');

  // Test 1: Chronic Recurrence Hotspots
  console.log('\n[1] Testing GET /api/analytics/recurrence ...');
  const recRes = await request('GET', '/api/analytics/recurrence');
  if ([200, 201].includes(recRes.status) && recRes.body.ok && Array.isArray(recRes.body.hotspots)) {
    console.log('✓ Recurrence analytics OK. Found ' + recRes.body.totalHotspots + ' chronic hotspot(s).');
  } else {
    throw new Error('Recurrence endpoint failed: ' + JSON.stringify(recRes.body));
  }

  // Test 2: Contractor Scorecards
  console.log('\n[2] Testing GET /api/analytics/contractors ...');
  const ctrRes = await request('GET', '/api/analytics/contractors');
  if ([200, 201].includes(ctrRes.status) && ctrRes.body.ok && Array.isArray(ctrRes.body.scorecards)) {
    console.log('✓ Contractor scorecards OK. Evaluated ' + ctrRes.body.scorecards.length + ' departments.');
    ctrRes.body.scorecards.forEach(c => {
      console.log('   - ' + c.departmentName + ': Grade=' + c.reliabilityGrade + ', SLA Compliance=' + c.slaComplianceRate + '%, Dispute=' + c.disputeRate + '%');
    });
  } else {
    throw new Error('Contractors endpoint failed: ' + JSON.stringify(ctrRes.body));
  }

  // Test 3: WhatsApp Webhook (Hindi)
  console.log('\n[3] Testing POST /api/webhook/whatsapp (Hindi Grievance) ...');
  const waHiRes = await request('POST', '/api/webhook/whatsapp', {
    From: 'whatsapp:+919876543210',
    Body: 'सड़क पर बड़ा गड्ढा है जिसे तुरंत ठीक करें',
    Latitude: 26.4499,
    Longitude: 80.3319,
    lang: 'hi'
  });
  if ([200, 201].includes(waHiRes.status) && waHiRes.body.ok && waHiRes.body.whatsappReply) {
    console.log('✓ WhatsApp Hindi ingestion OK (HTTP ' + waHiRes.status + '). Ticket=' + waHiRes.body.ticketId);
    console.log('  Reply preview: ' + waHiRes.body.whatsappReply.split('\n')[0]);
  } else {
    throw new Error('WhatsApp Hindi webhook failed (HTTP ' + waHiRes.status + '): ' + JSON.stringify(waHiRes.body));
  }

  // Test 4: WhatsApp Webhook (English)
  console.log('\n[4] Testing POST /api/webhook/whatsapp (English Grievance) ...');
  const waEnRes = await request('POST', '/api/webhook/whatsapp', {
    From: 'whatsapp:+919988776655',
    Body: 'Broken streetlight outside apartment block',
    Latitude: 26.4520,
    Longitude: 80.3350,
    lang: 'en'
  });
  if ([200, 201].includes(waEnRes.status) && waEnRes.body.ok && waEnRes.body.whatsappReply) {
    console.log('✓ WhatsApp English ingestion OK (HTTP ' + waEnRes.status + '). Ticket=' + waEnRes.body.ticketId);
    console.log('  Reply preview: ' + waEnRes.body.whatsappReply.split('\n')[0]);
  } else {
    throw new Error('WhatsApp English webhook failed (HTTP ' + waEnRes.status + '): ' + JSON.stringify(waEnRes.body));
  }

  // Test 5: DPDP Act 2023 Digital Privacy Shield
  console.log('\n[5] Testing POST /api/privacy/anonymize ...');
  const dummyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGYzMMAAD1/g/5bJ13lQAAAABJRU5ErkJggg==';
  const privRes = await request('POST', '/api/privacy/anonymize', { photoBase64: dummyPng });
  const pc = privRes.body.privacy_compliance || privRes.body;
  if ([200, 201].includes(privRes.status) && (pc.dpdp_compliant || privRes.body.ok)) {
    console.log('✓ Privacy shield anonymization OK. Faces blurred=' + (pc.faces_redacted || 0) + ', Plates blurred=' + (pc.plates_redacted || 0));
  } else {
    throw new Error('Privacy anonymize endpoint failed: ' + JSON.stringify(privRes.body));
  }

  // Test 6: Cost Estimation & Severity on Reports
  console.log('\n[6] Verifying PWD SoR Cost & Hazard Severity on active reports ...');
  const repRes = await request('GET', '/api/reports?limit=5');
  if ([200, 201].includes(repRes.status) && Array.isArray(repRes.body) && repRes.body.length > 0) {
    const r0 = repRes.body[0];
    if (r0.costEstimate && r0.severityAssessment && r0.privacyCompliance) {
      console.log('✓ Report ' + r0.id + ' has full enterprise metadata:');
      console.log('   - Severity: Level ' + r0.severityAssessment.level + ' (' + r0.severityAssessment.badge + ')');
      console.log('   - PWD Budget: ' + r0.costEstimate.formattedCost + ' (' + r0.costEstimate.materialRequirement + ')');
      console.log('   - DPDP Compliant: ' + r0.privacyCompliance.dpdp_compliant);
    } else {
      throw new Error('Report ' + r0.id + ' missing cost, severity, or privacy metadata');
    }
  }

  // Test 7: Anti-Fraud Resolution Verification
  console.log('\n[7] Testing Anti-Fraud resolution verification on ticket status update ...');
  const repList = repRes.body;
  const targetReport = repList[0];
  const patchRes = await request('PATCH', '/api/reports/' + targetReport.id + '/status', {
    status: 'resolved',
    resolutionPhotoBase64: dummyPng
  });
  if ([200, 201].includes(patchRes.status) && patchRes.body.status === 'resolved') {
    console.log('✓ Status updated to resolved. Proof attached: ' + (patchRes.body.resolutionPhotoUrl ? 'Yes' : 'No'));
    if (patchRes.body.resolutionVerification) {
      console.log('   - Verification scene similarity: ' + patchRes.body.resolutionVerification.similarity_score);
      console.log('   - Anti-Fraud Flag: ' + patchRes.body.antiFraudFlag);
    }
  } else {
    throw new Error('Resolution patch failed: ' + JSON.stringify(patchRes.body));
  }

  console.log('\n🎉 ALL ENTERPRISE ENHANCEMENT TESTS PASSED PERFECTLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
