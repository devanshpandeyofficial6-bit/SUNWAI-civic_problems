'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findWard, distanceMeters, greedyCluster } = require('./lib/geo');
const {
  classify,
  classifyImage,
  checkAiHealth,
  submitFeedbackToAi,
  triggerAutoTraining,
  getAiTrainingStatus,
  AI_CONFIDENCE_THRESHOLD,
} = require('./lib/classifier');
const { syncFromExternalApi } = require('./lib/api-sync');
const { detectWard } = require('./lib/ward-extractor');
const { SupabaseService, SUPABASE_SCHEMA_SQL } = require('./lib/supabase');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const WARDS_PATH = path.join(ROOT, 'data', 'wards.geojson');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const CATEGORY_SLA_HOURS = {
  pothole: 168, 
  streetlight: 72, 
  garbage: 48,
  water_leakage: 72,
  broken_infrastructure: 120,
  other: 120,
};
const DUPLICATE_RADIUS_M = 50;
const CLUSTER_RADIUS_M = 200;

function computePriority(report) {
  const count = report.reportCount || (report.upvotes ? report.upvotes.length : 1);
  const isBreached = Boolean(report.escalated);
  const highSeverity = ['pothole', 'water_leakage'].includes(report.category);
  if (count >= 3 || isBreached || (count >= 2 && highSeverity)) {
    return 'HIGH';
  }
  if (count >= 2 || highSeverity) {
    return 'MEDIUM';
  }
  return 'NORMAL';
}

function sanitizeAiClassification(aiMeta) {
  if (!aiMeta) return null;
  const clean = {
    category: aiMeta.category || 'other',
    confidence: typeof aiMeta.confidence === 'number' ? aiMeta.confidence : 0,
    detections: Array.isArray(aiMeta.detections) ? aiMeta.detections : [],
    model: aiMeta.model || 'YOLOv8-Civic',
    source: aiMeta.source || 'ai',
    isLowConfidence: Boolean(aiMeta.isLowConfidence),
    confidenceThreshold: aiMeta.confidenceThreshold || 0.7,
    available: Boolean(aiMeta.available),
  };
  if (aiMeta.reason) clean.reason = aiMeta.reason;
  if (aiMeta.categoryBreakdown) clean.categoryBreakdown = aiMeta.categoryBreakdown;
  if (Array.isArray(aiMeta.allCategories)) clean.allCategories = aiMeta.allCategories;
  if (aiMeta.annotatedImage && typeof aiMeta.annotatedImage === 'string' && aiMeta.annotatedImage.startsWith('data:image')) {
    const saved = saveBase64Image(aiMeta.annotatedImage, 'ai-box');
    if (saved) clean.annotatedImageUrl = saved.url;
  } else if (aiMeta.annotatedImageUrl) {
    clean.annotatedImageUrl = aiMeta.annotatedImageUrl;
  }
  return clean;
}

function loadDB() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  for (const r of db.reports || []) {
    if (typeof r.reportCount !== 'number') {
      r.reportCount = Array.isArray(r.upvotes) ? Math.max(1, r.upvotes.length) : 1;
    }
    if (!Array.isArray(r.reporters)) {
      r.reporters = Array.isArray(r.upvotes) && r.upvotes.length ? [...r.upvotes] : ['anon-citizen'];
    }
    if (!Array.isArray(r.citizenSubmissions)) {
      r.citizenSubmissions = [
        {
          photoUrl: r.photoUrl || null,
          description: r.description || '',
          timestamp: r.createdAt || new Date().toISOString(),
          userId: r.reporters[0] || 'anon-citizen',
          aiClassification: r.aiClassification || null,
        },
      ];
    }
    if (!r.citizenDetails) {
      r.citizenDetails = {
        name: 'Citizen (Verified Resident)',
        email: 'citizen@sunwai.gov.in',
        phone: '+91 98765 43210',
        aadhaar: 'XXXX-XXXX-9112',
      };
    }
    r.priority = computePriority(r);
  }
  return db;
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function loadWards() {
  return JSON.parse(fs.readFileSync(WARDS_PATH, 'utf8')).features;
}

function getSupabase() {
  const db = loadDB();
  const cfg = db.supabaseConfig || {};
  return new SupabaseService({
    url: cfg.url || process.env.SUPABASE_URL,
    key: cfg.key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  });
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function saveBase64Image(base64DataUrl, prefix) {
  if (!base64DataUrl) return null;
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(base64DataUrl);
  if (!match) return null;
  const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
  const buffer = Buffer.from(match[2], 'base64');
  const filename = `${prefix}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return { url: `/uploads/${filename}`, buffer };
}

function computeWardScore(wardId, reports) {
  const wardReports = reports.filter((r) => r.wardId === wardId);
  const closedVerified = wardReports.filter(
    (r) => r.status === 'closed' && r.verification.status === 'confirmed'
  );
  const disputed = wardReports.filter((r) => r.verification.status === 'disputed');
  const totalVerifiedEvents = closedVerified.length + disputed.length;

  const avgResolutionHours =
    closedVerified.length === 0
      ? null
      : closedVerified.reduce((sum, r) => {
          const hrs = (new Date(r.updatedAt) - new Date(r.createdAt)) / 36e5;
          return sum + hrs;
        }, 0) / closedVerified.length;

  const disputeRate = totalVerifiedEvents === 0 ? 0 : disputed.length / totalVerifiedEvents;

  const volumeScore = Math.min(60, closedVerified.length * 6);
  const speedScore =
    avgResolutionHours === null ? 0 : Math.max(0, 25 - avgResolutionHours / 12);
  const disputePenalty = disputeRate * 25;
  const score = Math.max(0, Math.min(100, Math.round(volumeScore + speedScore - disputePenalty)));

  return {
    wardId,
    verifiedResolutions: closedVerified.length,
    avgResolutionHours: avgResolutionHours === null ? null : Math.round(avgResolutionHours * 10) / 10,
    disputeRate: Math.round(disputeRate * 1000) / 1000,
    openReports: wardReports.filter((r) => !['closed', 'resolved'].includes(r.status)).length,
    civicHealthScore: score,
  };
}

function runSlaSweep() {
  const db = loadDB();
  let changed = false;
  const now = Date.now();
  for (const r of db.reports) {
    if (['closed', 'resolved'].includes(r.status)) continue;
    const ageHours = (now - new Date(r.createdAt).getTime()) / 36e5;
    if (ageHours > r.slaHours && !r.escalated) {
      r.escalated = true;
      r.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) saveDB(db);
}
setInterval(runSlaSweep, 60 * 1000); 
runSlaSweep();

const routes = [];
function route(method, regex, handler) {
  routes.push({ method, regex, handler });
}

route('GET', /^\/api\/health$/, async (req, res) => {
  send(res, 200, { ok: true, time: new Date().toISOString() });
});

route('GET', /^\/api\/wards$/, async (req, res) => {
  const db = loadDB();
  const wards = loadWards();
  const out = wards.map((w) => ({
    wardId: w.properties.wardId,
    wardName: w.properties.wardName,
    geometry: w.geometry,
    ...computeWardScore(w.properties.wardId, db.reports),
  }));
  out.sort((a, b) => b.civicHealthScore - a.civicHealthScore);
  send(res, 200, out);
});

route('GET', /^\/api\/wards\/detect$/, async (req, res, m, query) => {
  const lat = parseFloat(query.lat);
  const lng = parseFloat(query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return send(res, 400, { error: 'lat and lng parameters required' });
  }
  const wards = loadWards();
  const result = await detectWard(lat, lng, wards);
  send(res, 200, result);
});

route('GET', /^\/api\/wards\/([\w-]+)$/, async (req, res, m) => {
  const db = loadDB();
  const wards = loadWards();
  const ward = wards.find((w) => w.properties.wardId === m[1]);
  if (!ward) return send(res, 404, { error: 'ward not found' });
  send(res, 200, {
    wardId: ward.properties.wardId,
    wardName: ward.properties.wardName,
    geometry: ward.geometry,
    ...computeWardScore(ward.properties.wardId, db.reports),
  });
});

route('POST', /^\/api\/auth\/login$/, async (req, res) => {
  const body = await readBody(req);
  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';

  if (!email || !password) {
    return send(res, 400, { error: 'Email and password are required' });
  }

  if (email === 'admin@gmail.com' && password === 'admin123') {
    const token = 'head-' + crypto.randomBytes(16).toString('hex');
    return send(res, 200, {
      ok: true,
      token,
      user: {
        id: 'HEAD-001',
        name: 'Municipal Commissioner / Head (नगर आयुक्त)',
        email: 'admin@gmail.com',
        role: 'municipal_head',
        isSuperAdmin: true,
        designation: 'Municipal Commissioner',
        assignedWard: null,
        wardName: 'All Wards (Consolidated City-Wide Jurisdiction)',
      },
    });
  }

  const db = loadDB();
  const admins = db.admins || [];
  const matchedAdmin = admins.find((a) => a.email.toLowerCase() === email && a.password === password);
  if (matchedAdmin) {
    const token = 'adm-' + matchedAdmin.id + '-' + crypto.randomBytes(16).toString('hex');
    return send(res, 200, {
      ok: true,
      token,
      user: {
        id: matchedAdmin.id,
        name: matchedAdmin.name,
        email: matchedAdmin.email,
        role: 'admin',
        isSuperAdmin: false,
        designation: matchedAdmin.designation || 'Municipal Administrator',
        scope: matchedAdmin.scope || 'all_wards',
        assignedWard: matchedAdmin.assignedWard || null,
        wardName: matchedAdmin.wardName || 'All Wards (Consolidated City-Wide Jurisdiction)',
        department: matchedAdmin.department || 'Urban Administration',
      },
    });
  }

  const supabase = getSupabase();
  let employee = null;
  if (supabase.isConfigured()) {
    try {
      const supaEmployees = await supabase.getEmployees();
      if (supaEmployees) {
        employee = supaEmployees.find((e) => e.email.toLowerCase() === email && e.password === password);
      }
    } catch (e) {
      console.warn('Supabase query failed, falling back to local DB:', e.message);
    }
  }

  if (!employee) {
    const employees = db.employees || [];
    employee = employees.find((e) => e.email.toLowerCase() === email && e.password === password);
  }

  if (employee) {
    const token = 'emp-' + crypto.randomBytes(16).toString('hex');
    return send(res, 200, {
      ok: true,
      token,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: 'ward_employee',
        isSuperAdmin: false,
        assignedWard: employee.assignedWard,
        wardName: employee.wardName,
        department: employee.department || 'Ward Municipal Services',
      },
    });
  }

  return send(res, 401, { error: 'Invalid credentials. Please verify your official email and password.' });
});

route('GET', /^\/api\/auth\/me$/, async (req, res, m, query) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '') || query.token;
  if (!token) return send(res, 401, { error: 'Not authenticated' });
  if (token.startsWith('head-')) {
    return send(res, 200, {
      id: 'HEAD-001',
      name: 'Municipal Commissioner / Head (नगर आयुक्त)',
      email: 'admin@gmail.com',
      role: 'municipal_head',
      isSuperAdmin: true,
      designation: 'Municipal Commissioner',
      assignedWard: null,
      wardName: 'All Wards (Consolidated City-Wide Jurisdiction)',
    });
  }
  const db = loadDB();
  if (token.startsWith('adm-')) {
    const admins = db.admins || [];
    const adm = admins.find((a) => token.includes(a.id)) || admins[0];
    if (adm) {
      return send(res, 200, {
        id: adm.id,
        name: adm.name,
        email: adm.email,
        role: 'admin',
        isSuperAdmin: false,
        designation: adm.designation || 'Municipal Administrator',
        scope: adm.scope || 'all_wards',
        assignedWard: adm.assignedWard || null,
        wardName: adm.wardName || 'All Wards (Consolidated City-Wide Jurisdiction)',
        department: adm.department || 'Urban Administration',
      });
    }
  }

  const employees = db.employees || [];
  const emp = employees.find((e) => token.includes(e.id)) || employees[0];
  if (emp) {
    return send(res, 200, {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: 'ward_employee',
      isSuperAdmin: false,
      assignedWard: emp.assignedWard,
      wardName: emp.wardName,
      department: emp.department,
    });
  }
  send(res, 401, { error: 'Session expired' });
});

route('GET', /^\/api\/admin\/admins$/, async (req, res) => {
  const db = loadDB();
  const list = db.admins || [];
  send(res, 200, list);
});

route('POST', /^\/api\/admin\/admins$/, async (req, res) => {
  const body = await readBody(req);
  const { name, email, password, designation, department, phone, scope, assignedWard } = body;
  if (!name || !email || !password) {
    return send(res, 400, { error: 'Name, email, and password are required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const db = loadDB();
  db.admins = db.admins || [];
  db.employees = db.employees || [];

  if (
    cleanEmail === 'admin@gmail.com' ||
    db.admins.some((a) => a.email.toLowerCase() === cleanEmail) ||
    db.employees.some((e) => e.email.toLowerCase() === cleanEmail)
  ) {
    return send(res, 400, { error: 'An administrator or employee with this email already exists.' });
  }

  const id = `ADM-${Date.now().toString().slice(-4)}`;
  const newAdmin = {
    id,
    name: name.trim(),
    email: cleanEmail,
    password,
    designation: (designation || 'Additional Municipal Commissioner').trim(),
    role: 'admin',
    scope: scope || 'all_wards',
    assignedWard: assignedWard || null,
    wardName: assignedWard ? `Ward ${assignedWard}` : 'All Wards (Consolidated City-Wide Jurisdiction)',
    department: (department || 'Urban Administration & Governance').trim(),
    phone: (phone || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: 'HEAD-001 (Municipal Commissioner / Super Admin)',
  };

  db.admins.unshift(newAdmin);
  saveDB(db);

  send(res, 201, {
    ok: true,
    admin: newAdmin,
  });
});

route('DELETE', /^\/api\/admin\/admins\/([\w-]+)$/, async (req, res, m) => {
  const adminId = m[1];
  if (adminId === 'HEAD-001') {
    return send(res, 400, { error: 'The primary Super Admin account cannot be revoked.' });
  }
  const db = loadDB();
  db.admins = db.admins || [];
  const idx = db.admins.findIndex((a) => a.id === adminId);
  if (idx !== -1) {
    db.admins.splice(idx, 1);
    saveDB(db);
  }
  send(res, 200, { ok: true, deleted: adminId });
});

route('GET', /^\/api\/admin\/employees$/, async (req, res) => {
  const db = loadDB();
  let list = db.employees || [];
  const supabase = getSupabase();
  if (supabase.isConfigured()) {
    try {
      const supaList = await supabase.getEmployees();
      if (supaList && supaList.length > 0) {
        const emailSet = new Set(supaList.map((e) => e.email.toLowerCase()));
        list = [...supaList, ...list.filter((e) => !emailSet.has(e.email.toLowerCase()))];
      }
    } catch (e) {
      console.warn('Failed to fetch from Supabase:', e.message);
    }
  }
  send(res, 200, list);
});

route('POST', /^\/api\/admin\/employees$/, async (req, res) => {
  const body = await readBody(req);
  const { name, email, password, assignedWard, department, phone } = body;
  if (!name || !email || !password || !assignedWard) {
    return send(res, 400, { error: 'Name, email, password, and assigned ward are required.' });
  }

  const wards = loadWards();
  const wardFeature = wards.find((w) => w.properties.wardId === assignedWard);
  const wardName = wardFeature ? wardFeature.properties.wardName : `Ward ${assignedWard}`;

  const db = loadDB();
  db.employees = db.employees || [];

  const cleanEmail = email.toLowerCase().trim();
  if (db.employees.some((e) => e.email.toLowerCase() === cleanEmail) || cleanEmail === 'admin@gmail.com') {
    return send(res, 400, { error: 'An employee or admin with this email already exists.' });
  }

  const id = `EMP-${Date.now().toString().slice(-4)}`;
  const newEmp = {
    id,
    name: name.trim(),
    email: cleanEmail,
    password,
    assignedWard,
    wardName,
    department: department || 'Municipal Ward Services',
    phone: phone || '',
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabase();
  let supabaseSynced = false;
  if (supabase.isConfigured()) {
    try {
      const result = await supabase.createEmployee(newEmp);
      if (result) supabaseSynced = true;
    } catch (e) {
      console.warn('Supabase insert warning:', e.message);
    }
  }

  db.employees.unshift(newEmp);
  saveDB(db);

  send(res, 201, {
    ok: true,
    employee: newEmp,
    supabaseSynced,
  });
});

route('DELETE', /^\/api\/admin\/employees\/([\w-]+)$/, async (req, res, m) => {
  const empId = m[1];
  const db = loadDB();
  db.employees = db.employees || [];
  const idx = db.employees.findIndex((e) => e.id === empId);

  const supabase = getSupabase();
  if (supabase.isConfigured()) {
    try {
      await supabase.deleteEmployee(empId);
    } catch (e) {
      console.warn('Supabase delete warning:', e.message);
    }
  }

  if (idx !== -1) {
    db.employees.splice(idx, 1);
    saveDB(db);
  }

  send(res, 200, { ok: true, deleted: empId });
});

route('GET', /^\/api\/admin\/supabase-status$/, async (req, res) => {
  const supabase = getSupabase();
  const db = loadDB();
  const config = db.supabaseConfig || {};
  const test = await supabase.testConnection();
  send(res, 200, {
    configured: supabase.isConfigured(),
    url: config.url || '',
    hasKey: Boolean(config.key),
    connected: test.ok,
    tableMissing: test.tableMissing || false,
    message: test.message,
    schemaSql: SUPABASE_SCHEMA_SQL,
  });
});

route('POST', /^\/api\/admin\/supabase-config$/, async (req, res) => {
  const body = await readBody(req);
  const { url: supaUrl, key: supaKey } = body;
  const db = loadDB();
  db.supabaseConfig = {
    url: (supaUrl || '').trim(),
    key: (supaKey || '').trim(),
  };
  saveDB(db);
  const supabase = getSupabase();
  const test = await supabase.testConnection();
  send(res, 200, {
    ok: true,
    configured: supabase.isConfigured(),
    connected: test.ok,
    message: test.message,
  });
});

route('GET', /^\/api\/ai\/status$/, async (req, res) => {
  const status = await checkAiHealth();
  send(res, 200, {
    ...status,
    threshold: AI_CONFIDENCE_THRESHOLD,
    duplicateRadiusMeters: DUPLICATE_RADIUS_M,
  });
});

route('POST', /^\/api\/ai\/analyze$/, async (req, res) => {
  const body = await readBody(req);
  const { photoBase64, filename } = body;
  if (!photoBase64) {
    return send(res, 400, { error: 'photoBase64 is required for AI analysis' });
  }
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(photoBase64);
  const buffer = match ? Buffer.from(match[2], 'base64') : Buffer.from(photoBase64, 'base64');
  const result = await classifyImage(buffer, filename || 'photo.jpg');
  send(res, 200, {
    ok: true,
    classification: result,
  });
});

route('POST', /^\/api\/external\/sync$/, async (req, res) => {
  const body = await readBody(req);
  const { apiUrl, apiKey, limit = 5 } = body;
  const db = loadDB();
  const wards = loadWards();

  try {
    const result = await syncFromExternalApi({
      apiUrl,
      apiKey,
      db,
      wards,
      limit: Math.min(25, parseInt(limit, 10) || 5),
    });
    saveDB(db);
    send(res, 200, result);
  } catch (err) {
    send(res, 500, { error: `Sync failed: ${err.message}` });
  }
});

route('POST', /^\/api\/ai\/train-remote$/, async (req, res) => {
  const body = await readBody(req);
  const trainRes = await triggerAutoTraining(body);
  send(res, 200, trainRes);
});

route('GET', /^\/api\/ai\/training-status$/, async (req, res) => {
  const status = await getAiTrainingStatus();
  send(res, 200, status);
});

route('GET', /^\/api\/reports$/, async (req, res, m, query) => {
  const db = loadDB();
  let list = db.reports;
  if (query.ward) list = list.filter((r) => r.wardId === query.ward);
  if (query.status) list = list.filter((r) => r.status === query.status);
  if (query.category) list = list.filter((r) => r.category === query.category);
  if (query.escalated === 'true') list = list.filter((r) => r.escalated);
  if (query.minConfidence) {
    const minC = parseFloat(query.minConfidence);
    if (!isNaN(minC)) {
      list = list.filter((r) => r.aiClassification && r.aiClassification.confidence >= minC);
    }
  }

  if (query.sortBy === 'reportCount') {
    list = [...list].sort((a, b) => (b.reportCount || 0) - (a.reportCount || 0));
  } else if (query.sortBy === 'priority') {
    const order = { HIGH: 3, MEDIUM: 2, NORMAL: 1 };
    list = [...list].sort((a, b) => (order[b.priority] || 0) - (order[a.priority] || 0));
  } else if (query.sortBy === 'confidence') {
    list = [...list].sort(
      (a, b) =>
        ((b.aiClassification && b.aiClassification.confidence) || 0) -
        ((a.aiClassification && a.aiClassification.confidence) || 0)
    );
  } else {
    list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  send(res, 200, list);
});

route('GET', /^\/api\/reports\/([\w-]+)$/, async (req, res, m) => {
  const db = loadDB();
  const r = db.reports.find((x) => x.id === m[1]);
  if (!r) return send(res, 404, { error: 'not found' });
  send(res, 200, r);
});

route('GET', /^\/api\/nearby$/, async (req, res, m, query) => {
  const lat = parseFloat(query.lat);
  const lng = parseFloat(query.lng);
  const category = query.category;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return send(res, 400, { error: 'lat/lng required' });
  const db = loadDB();
  const nearby = db.reports.filter((r) => {
    if (['closed'].includes(r.status)) return false;
    if (category && r.category !== category) return false;
    return distanceMeters(lat, lng, r.lat, r.lng) <= DUPLICATE_RADIUS_M;
  });

  nearby.sort((a, b) => distanceMeters(lat, lng, a.lat, a.lng) - distanceMeters(lat, lng, b.lat, b.lng));
  send(res, 200, nearby);
});

route('POST', /^\/api\/reports$/, async (req, res) => {
  const body = await readBody(req);
  const {
    description = '',
    lat,
    lng,
    photoBase64,
    filename,
    providedCategory,
    providedWardId,
    providedWardName,
    userId: rawUserId,
    forceNewReport = false,
    citizenName = '',
    citizenEmail = '',
    citizenPhone = '',
    citizenAadhaar = '',
  } = body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return send(res, 400, { error: 'lat and lng (numbers) are required' });
  }

  const userId = rawUserId || `anon-${crypto.randomBytes(3).toString('hex')}`;

  const cleanAadhaar = (citizenAadhaar || '').replace(/\D/g, '');
  const maskedAadhaar = cleanAadhaar.length === 12
    ? `XXXX-XXXX-${cleanAadhaar.slice(-4)}`
    : (citizenAadhaar ? citizenAadhaar.trim() : 'XXXX-XXXX-9112');

  const citizenDetails = {
    name: citizenName.trim() || 'Citizen (Verified Resident)',
    email: citizenEmail.trim().toLowerCase() || 'citizen@sunwai.gov.in',
    phone: citizenPhone.trim() || '+91 98765 43210',
    aadhaar: maskedAadhaar,
    rawAadhaar: cleanAadhaar.length === 12 ? cleanAadhaar : null,
  };

  let photoUrl = null;
  let photoBuffer = null;
  if (photoBase64) {
    const saved = saveBase64Image(photoBase64, 'report');
    if (saved) {
      photoUrl = saved.url;
      photoBuffer = saved.buffer;
    }
  }

  let category = providedCategory;
  let aiMeta = null;
  if (photoBuffer) {
    aiMeta = await classifyImage(photoBuffer, filename || '');
    if (!category && aiMeta && aiMeta.available && !aiMeta.isLowConfidence) {
      category = aiMeta.category;
    }
  }
  if (!category && aiMeta && aiMeta.category) {
    category = aiMeta.category;
  }
  if (!category) {
    category = 'other';
  }

  const wards = loadWards();
  const detectedWard = await detectWard(lat, lng, wards);

  let wardId = detectedWard.wardId || null;
  let wardName = detectedWard.wardName || 'Unassigned (outside mapped wards)';
  let wardSource = detectedWard.source || 'DataMeet';

  if (providedWardId) {
    const matchedFeature = wards.find((w) => w.properties.wardId === providedWardId);
    wardId = providedWardId;
    wardName = providedWardName || (matchedFeature ? matchedFeature.properties.wardName : providedWardId);
    wardSource = 'Citizen Verified';
  }

  const db = loadDB();

  const nearbyDuplicates = db.reports.filter(
    (r) =>
      r.category === category &&
      !['closed'].includes(r.status) &&
      distanceMeters(lat, lng, r.lat, r.lng) <= DUPLICATE_RADIUS_M
  );

  const now = new Date().toISOString();

  const cleanAi = sanitizeAiClassification(aiMeta);

  if (nearbyDuplicates.length > 0 && !forceNewReport) {
    const canonical = nearbyDuplicates[0];

    if (!Array.isArray(canonical.reporters)) {
      canonical.reporters = Array.isArray(canonical.upvotes) && canonical.upvotes.length
        ? [...canonical.upvotes]
        : ['anon-reporter'];
    }
    if (!Array.isArray(canonical.citizenSubmissions)) {
      canonical.citizenSubmissions = [
        {
          photoUrl: canonical.photoUrl,
          description: canonical.description,
          timestamp: canonical.createdAt,
          userId: canonical.reporters[0] || 'anon-reporter',
          aiClassification: sanitizeAiClassification(canonical.aiClassification) || null,
        },
      ];
    }
    if (!Array.isArray(canonical.upvotes)) canonical.upvotes = [];

    if (!canonical.reporters.includes(userId)) {
      canonical.reporters.push(userId);
    }
    canonical.reportCount = canonical.reporters.length;

    if (!canonical.upvotes.includes(userId)) {
      canonical.upvotes.push(userId);
    }

    canonical.citizenSubmissions.push({
      photoUrl,
      description,
      timestamp: now,
      userId,
      citizenDetails,
      aiClassification: cleanAi,
    });

    if (!canonical.citizenDetails || canonical.citizenDetails.name === 'Citizen (Verified Resident)') {
      if (citizenName && citizenName.trim()) {
        canonical.citizenDetails = citizenDetails;
      }
    }

    if (canonical.status === 'resolved') {
      canonical.status = 'in_progress';
      canonical.verification = { status: 'pending', confirmedBy: [], disputedBy: [] };
    }

    canonical.updatedAt = now;
    canonical.priority = computePriority(canonical);

    if (!canonical.photoUrl && photoUrl) {
      canonical.photoUrl = photoUrl;
    }

    saveDB(db);

    return send(res, 200, {
      ok: true,
      merged: true,
      canonicalId: canonical.id,
      reportCount: canonical.reportCount,
      report: canonical,
      message: `Your grievance has been automatically merged with active issue ${canonical.id}. Total ${canonical.reportCount} citizen(s) have reported this issue.`,
      duplicateWarning: {
        count: nearbyDuplicates.length,
        canonicalId: canonical.id,
        reportCount: canonical.reportCount,
        message: `${nearbyDuplicates.length} matching report(s) exist within ${DUPLICATE_RADIUS_M}m. Submissions automatically merged into one canonical issue.`,
      },
    });
  }

  const id = `SNW-${db.nextId}`;
  db.nextId += 1;

  const report = {
    id,
    category,
    description,
    photoUrl,
    lat,
    lng,
    wardId,
    wardName,
    wardSource,
    status: 'reported',
    createdAt: now,
    updatedAt: now,
    upvotes: [userId],
    reporters: [userId],
    reportCount: 1,
    citizenDetails,
    citizenSubmissions: [
      {
        photoUrl,
        description,
        timestamp: now,
        userId,
        citizenDetails,
        aiClassification: cleanAi,
      },
    ],
    duplicateOf: null,
    slaHours: CATEGORY_SLA_HOURS[category] || CATEGORY_SLA_HOURS.other,
    escalated: false,
    resolutionPhotoUrl: null,
    verification: { status: 'pending', confirmedBy: [], disputedBy: [] },
    aiClassification: cleanAi,
  };
  report.priority = computePriority(report);

  db.reports.push(report);
  saveDB(db);

  send(res, 201, {
    ok: true,
    merged: false,
    report,
    duplicateWarning: null,
  });
});

route('POST', /^\/api\/reports\/([\w-]+)\/upvote$/, async (req, res, m) => {
  const body = await readBody(req);
  const userId = body.userId || `anon-${crypto.randomBytes(3).toString('hex')}`;
  const db = loadDB();
  const r = db.reports.find((x) => x.id === m[1]);
  if (!r) return send(res, 404, { error: 'not found' });
  if (!r.upvotes) r.upvotes = [];
  if (!r.reporters) r.reporters = [...r.upvotes];
  if (!r.upvotes.includes(userId)) r.upvotes.push(userId);
  if (!r.reporters.includes(userId)) r.reporters.push(userId);
  r.reportCount = r.reporters.length;
  r.priority = computePriority(r);
  r.updatedAt = new Date().toISOString();
  saveDB(db);
  send(res, 200, r);
});

route('PATCH', /^\/api\/reports\/([\w-]+)\/status$/, async (req, res, m) => {
  const body = await readBody(req);
  const { status, resolutionPhotoBase64 } = body;
  const valid = ['reported', 'acknowledged', 'in_progress', 'resolved'];
  if (!valid.includes(status)) return send(res, 400, { error: `status must be one of ${valid.join(', ')}` });

  const db = loadDB();
  const r = db.reports.find((x) => x.id === m[1]);
  if (!r) return send(res, 404, { error: 'not found' });

  r.status = status;
  r.updatedAt = new Date().toISOString();

  if (status === 'resolved') {
    if (resolutionPhotoBase64) {
      const saved = saveBase64Image(resolutionPhotoBase64, 'resolution');
      if (saved) r.resolutionPhotoUrl = saved.url;
    }

    r.verification = { status: 'pending', confirmedBy: [], disputedBy: [] };

    // Push verified ground-truth label to AI continuous learning engine
    if (r.photoUrl) {
      submitFeedbackToAi(r.photoUrl, r.category, r.id);
    }
  }

  saveDB(db);
  send(res, 200, r);
});

route('POST', /^\/api\/reports\/([\w-]+)\/verify$/, async (req, res, m) => {
  const body = await readBody(req);
  const { result, userId } = body; 
  if (!['confirm', 'dispute'].includes(result)) {
    return send(res, 400, { error: "result must be 'confirm' or 'dispute'" });
  }
  const db = loadDB();
  const r = db.reports.find((x) => x.id === m[1]);
  if (!r) return send(res, 404, { error: 'not found' });
  if (r.status !== 'resolved') {
    return send(res, 409, { error: 'report is not awaiting verification' });
  }

  const uid = userId || `anon-${crypto.randomBytes(3).toString('hex')}`;
  if (result === 'confirm') {
    if (!r.verification.confirmedBy.includes(uid)) r.verification.confirmedBy.push(uid);
    r.verification.status = 'confirmed';
    r.status = 'closed'; 

    // Confirmed resolution ground truth pushed to AI continuous learner
    if (r.photoUrl) {
      submitFeedbackToAi(r.photoUrl, r.category, r.id);
    }
  } else {
    if (!r.verification.disputedBy.includes(uid)) r.verification.disputedBy.push(uid);
    r.verification.status = 'disputed';
    r.status = 'reported'; 
    r.escalated = true; 
  }
  r.updatedAt = new Date().toISOString();
  saveDB(db);
  send(res, 200, r);
});

route('GET', /^\/api\/clusters$/, async (req, res, m, query) => {
  const db = loadDB();
  let list = db.reports.filter((r) => ['acknowledged', 'in_progress'].includes(r.status));
  if (query.ward) list = list.filter((r) => r.wardId === query.ward);
  const clusters = greedyCluster(list, CLUSTER_RADIUS_M).map((c, i) => ({
    clusterId: `CL-${i + 1}`,
    center: c.center,
    memberCount: c.members.length,
    estimatedTravelTimeSavedPct:
      c.members.length > 1 ? Math.min(75, Math.round(100 - 100 / c.members.length)) : 0,
    members: c.members,
  }));
  send(res, 200, clusters);
});

route('GET', /^\/api\/monthly-report$/, async (req, res, m, query) => {
  const db = loadDB();
  const wards = loadWards();
  const wardId = query.ward;
  const targets = wardId ? wards.filter((w) => w.properties.wardId === wardId) : wards;
  const report = {
    generatedAt: new Date().toISOString(),
    period: `${new Date().toISOString().slice(0, 7)}`,
    wards: targets.map((w) => ({
      wardId: w.properties.wardId,
      wardName: w.properties.wardName,
      ...computeWardScore(w.properties.wardId, db.reports),
    })),
  };
  send(res, 200, report);
});

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.geojson': 'application/json',
};

function serveStatic(req, res, urlPath, baseDir) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(baseDir, rel));
  if (!filePath.startsWith(baseDir)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const query = Object.fromEntries(urlObj.searchParams.entries());

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  if (pathname.startsWith('/api/')) {
    const match = routes.find((r) => r.method === req.method && r.regex.test(pathname));
    if (!match) return send(res, 404, { error: 'no such endpoint' });
    try {
      await match.handler(req, res, pathname.match(match.regex), query);
    } catch (e) {
      send(res, 500, { error: e.message || 'internal error' });
    }
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    return serveStatic(req, res, pathname.replace('/uploads', ''), UPLOADS_DIR);
  }

  return serveStatic(req, res, pathname, PUBLIC_DIR);
});

server.listen(PORT, () => {
  console.log(`SUNWAI backend running at http://localhost:${PORT}`);
});
