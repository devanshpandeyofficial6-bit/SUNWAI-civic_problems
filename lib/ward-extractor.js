'use strict';

const https = require('https');
const http = require('http');
const { findWard, findWardWithDetail } = require('./geo');

function mercatorToWgs84(x, y) {
  const lng = (x * 180) / 20037508.34;
  const lat = (Math.atan(Math.exp((y / 20037508.34) * Math.PI)) * 360) / Math.PI - 90;
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

function convertCoordinates(coords) {
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {

    if (Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) {
      return mercatorToWgs84(coords[0], coords[1]);
    }
    return coords;
  }
  return coords.map(convertCoordinates);
}

function normalizeFeature(feature, index) {
  const props = feature.properties || {};
  const wardNo = props['Ward No'] || props.ward_no || props.wardNo || (index + 1);
  const wardId = props.wardId || (wardNo ? `W${String(wardNo).padStart(2, '0')}` : `W${index + 1}`);
  const rawName = props['Ward Name'] || props.ward_name || props.wardName || props.name || `Ward ${wardNo}`;
  const wardName = rawName.toLowerCase().startsWith('ward') ? rawName : `Ward ${wardNo} - ${rawName}`;
  const zoneNo = props['Zone No'] || props.zone_no || props.zone || null;

  return {
    type: 'Feature',
    properties: {
      wardId,
      wardNo: Number(wardNo) || null,
      wardName,
      zoneNo: zoneNo ? Number(zoneNo) : null,
      source: 'DataMeet Municipal Spatial Data',
    },
    geometry: {
      type: feature.geometry.type,
      coordinates: convertCoordinates(feature.geometry.coordinates),
    },
  };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Sunwai-Gov-Portal/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Network request timed out'));
    });
  });
}

const WARD_ALIASES = [
  { match: ['shyam nagar', 'sujatganj', 'sujat ganj', 'pac shyam nagar', 'ward 74', 'shyamnagar'], wardId: 'W74', wardName: 'Ward 74 - Shyam Nagar', wardNo: 74, zoneNo: 2 },
  { match: ['daheli sujanpur', 'sujanpur', 'kda colony daheli', 'ward 53'], wardId: 'W53', wardName: 'Ward 53 - Daheli Sujanpur KDA Colony', wardNo: 53, zoneNo: 2 },
  { match: ['kidwai nagar', 'ward 07', 'ward 7'], wardId: 'W07', wardName: 'Ward 07 - Kidwai Nagar', wardNo: 7, zoneNo: 3 },
  { match: ['civil lines', 'transport nagar', 'ward 12'], wardId: 'W12', wardName: 'Ward 12 - Transport Nagar / Civil Lines', wardNo: 12, zoneNo: 3 },
  { match: ['kakadeo', 'behna jhabhar', 'ward 22'], wardId: 'W22', wardName: 'Ward 22 - Behna Jhabhar / Kakadeo', wardNo: 22, zoneNo: 4 },
  { match: ['govind nagar', 'permat', 'ward 15'], wardId: 'W15', wardName: 'Ward 15 - Permat / Govind Nagar', wardNo: 15, zoneNo: 4 },
  { match: ['panki', 'ward 33'], wardId: 'W33', wardName: 'Ward 33 - Panki', wardNo: 33, zoneNo: 5 },
  { match: ['chakeri', 'ward 10'], wardId: 'W10', wardName: 'Ward 10 - Chakeri', wardNo: 10, zoneNo: 2 },
  { match: ['jajmau', 'ward 66'], wardId: 'W66', wardName: 'Ward 66 - Jajmau South', wardNo: 66, zoneNo: 2 },
  { match: ['barra', 'ward 80'], wardId: 'W80', wardName: 'Ward 80 - Barra East', wardNo: 80, zoneNo: 3 },
  { match: ['yashoda nagar', 'ward 67'], wardId: 'W67', wardName: 'Ward 67 - Yashoda Nagar East', wardNo: 67, zoneNo: 2 },
  { match: ['naubasta', 'ward 30'], wardId: 'W30', wardName: 'Ward 30 - Naubasta East', wardNo: 30, zoneNo: 2 },
  { match: ['naramau', 'ward 20'], wardId: 'W20', wardName: 'Ward 20 - Naramau', wardNo: 20, zoneNo: 6 },
  { match: ['ashok nagar', 'ward 43'], wardId: 'W43', wardName: 'Ward 43 - Ashok Nagar', wardNo: 43, zoneNo: 4 },
  { match: ['old kanpur', 'ward 1', 'ward 01'], wardId: 'W01', wardName: 'Ward 1 - Old Kanpur', wardNo: 1, zoneNo: 4 },
];

async function reverseLookupAdmin(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
    const data = await fetchJson(url);
    if (!data || !data.address) return null;
    const a = data.address;
    const locality = a.suburb || a.neighbourhood || a.residential || a.village || a.city_district || a.ward || '';
    const city = a.city || a.town || a.municipality || a.county || 'Kanpur';
    const state = a.state || 'Uttar Pradesh';

    return {
      rawAddress: `${locality} ${a.road || ''} ${city}`.toLowerCase(),
      locality: locality || 'Local Ward',
      city,
      state,
      source: 'Live Administrative Reverse Geocoder (OSM/Bharatlas)',
    };
  } catch (err) {
    return null;
  }
}

async function detectWard(lat, lng, loadedWards) {

  let detail = null;
  if (Array.isArray(loadedWards) && loadedWards.length > 0) {
    detail = findWardWithDetail(lat, lng, loadedWards);
  }

  if (detail && (detail.matchType === 'polygon' || detail.matchType === 'polygon_disambiguated')) {
    const props = detail.feature.properties;
    return {
      wardId: props.wardId,
      wardName: props.wardName,
      wardNo: props.wardNo || null,
      zoneNo: props.zoneNo || null,
      source: 'Kanpur Nagar Nigam GIS Polygon (Official Boundary)',
      matchedPolygon: true,
      precision: detail.precision || 'exact',
    };
  }

  const liveAdmin = await reverseLookupAdmin(lat, lng);
  if (liveAdmin && liveAdmin.rawAddress) {
    const aliasMatch = WARD_ALIASES.find(a =>
      a.match.some(m => liveAdmin.rawAddress.includes(m))
    );
    if (aliasMatch) {
      return {
        wardId: aliasMatch.wardId,
        wardName: aliasMatch.wardName,
        wardNo: aliasMatch.wardNo,
        zoneNo: aliasMatch.zoneNo,
        locality: liveAdmin.locality,
        source: 'Municipal Spatial GIS + Verified Administrative Address',
        matchedPolygon: true,
        precision: 'high',
      };
    }
  }

  if (detail && detail.matchType === 'proximity') {
    const props = detail.feature.properties;
    return {
      wardId: props.wardId,
      wardName: props.wardName,
      wardNo: props.wardNo || null,
      zoneNo: props.zoneNo || null,
      locality: liveAdmin ? liveAdmin.locality : null,
      source: 'Municipal Spatial Boundary (Proximity Snap)',
      matchedPolygon: true,
      precision: 'snapped',
      distanceMeters: detail.distanceMeters,
    };
  }

  if (liveAdmin) {
    return {
      wardId: `EXT-${Math.abs(Math.round(lat * 100))}`,
      wardName: `${liveAdmin.locality} (${liveAdmin.city})`,
      city: liveAdmin.city,
      state: liveAdmin.state,
      source: 'Live Administrative Reverse Geocoder (OSM/Bharatlas)',
      matchedOnline: true,
      precision: 'moderate',
    };
  }

  return {
    wardId: 'UNASSIGNED',
    wardName: 'Unassigned Jurisdiction (Outside Municipal Coverage)',
    matchedPolygon: false,
    precision: 'none',
  };
}

module.exports = {
  mercatorToWgs84,
  convertCoordinates,
  normalizeFeature,
  fetchJson,
  detectWard,
};
