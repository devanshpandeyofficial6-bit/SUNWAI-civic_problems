'use strict';

const https = require('https');
const http = require('http');
const url = require('url');

const SUPABASE_SCHEMA_SQL = `-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
CREATE TABLE IF NOT EXISTS public.sunwai_admins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    designation TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    scope TEXT DEFAULT 'all_wards',
    department TEXT DEFAULT 'Central Administration',
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT DEFAULT 'HEAD-001'
);

ALTER TABLE public.sunwai_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all actions for Sunwai admins" ON public.sunwai_admins
    FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sunwai_employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    assigned_ward TEXT NOT NULL,
    ward_name TEXT NOT NULL,
    department TEXT DEFAULT 'Municipal Services',
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security policies
ALTER TABLE public.sunwai_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all actions for Sunwai backend service" ON public.sunwai_employees
    FOR ALL USING (true) WITH CHECK (true);
`;

function requestSupabase(endpoint, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(endpoint);
    const client = parsed.protocol === 'http:' ? http : https;

    const req = client.request(parsed, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        if (data) {
          try {
            json = JSON.parse(data);
          } catch (e) {
            json = { raw: data };
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: json });
        } else {
          reject(new Error((json && (json.message || json.error_description || json.error)) || `HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(6000, () => {
      req.destroy();
      reject(new Error('Supabase request timed out'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

class SupabaseService {
  constructor(config = {}) {
    this.url = (config.url || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.key = config.key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  }

  isConfigured() {
    return Boolean(this.url && this.key && this.url.startsWith('http'));
  }

  getHeaders(extra = {}) {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async testConnection() {
    if (!this.isConfigured()) {
      return { ok: false, message: 'Supabase URL or Key not set. Running in local fallback mode.' };
    }
    try {

      const endpoint = `${this.url}/rest/v1/sunwai_employees?select=count`;
      const res = await requestSupabase(endpoint, {
        method: 'HEAD',
        headers: this.getHeaders({ 'Prefer': 'count=exact' }),
      });
      return { ok: true, message: 'Connected to Supabase successfully' };
    } catch (err) {

      if (err.message.includes('relation "public.sunwai_employees" does not exist')) {
        return {
          ok: true,
          tableMissing: true,
          message: 'Connected to Supabase, but "sunwai_employees" table is missing. Run the SQL schema script.',
        };
      }
      return { ok: false, message: err.message };
    }
  }

  async getEmployees() {
    if (!this.isConfigured()) return null;
    const endpoint = `${this.url}/rest/v1/sunwai_employees?select=*&order=created_at.desc`;
    const res = await requestSupabase(endpoint, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return (res.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      assignedWard: row.assigned_ward,
      wardName: row.ward_name,
      department: row.department,
      phone: row.phone,
      createdAt: row.created_at,
      source: 'supabase',
    }));
  }

  async createEmployee(emp) {
    if (!this.isConfigured()) return null;
    const endpoint = `${this.url}/rest/v1/sunwai_employees`;
    const payload = {
      id: emp.id,
      name: emp.name,
      email: emp.email.toLowerCase().trim(),
      password: emp.password,
      assigned_ward: emp.assignedWard,
      ward_name: emp.wardName,
      department: emp.department || 'Municipal Ward Services',
      phone: emp.phone || '',
      created_at: emp.createdAt || new Date().toISOString(),
    };
    const res = await requestSupabase(endpoint, {
      method: 'POST',
      headers: this.getHeaders({ 'Prefer': 'return=representation' }),
    }, payload);
    return res.data && res.data[0] ? res.data[0] : payload;
  }

  async deleteEmployee(id) {
    if (!this.isConfigured()) return null;
    const endpoint = `${this.url}/rest/v1/sunwai_employees?id=eq.${encodeURIComponent(id)}`;
    await requestSupabase(endpoint, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return true;
  }
}

module.exports = {
  SupabaseService,
  SUPABASE_SCHEMA_SQL,
};
