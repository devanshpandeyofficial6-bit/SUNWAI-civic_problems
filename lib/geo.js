'use strict';

/**
 * Haversine distance between two lat/lng points, in meters.
 */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Ray-casting point-in-polygon test.
 * polygon: array of [lng, lat] pairs (GeoJSON winding order), closed or open ring.
 * point: [lng, lat]
 */
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate the centroid [lng, lat] of a GeoJSON feature
 */
function getFeatureCentroid(feature) {
  const geom = feature.geometry;
  if (!geom || !geom.coordinates) return { lng: 0, lat: 0 };
  let points = [];
  if (geom.type === 'Polygon') {
    points = geom.coordinates[0];
  } else if (geom.type === 'MultiPolygon') {
    points = geom.coordinates.flatMap(poly => poly[0]);
  }
  if (!points.length) return { lng: 0, lat: 0 };
  const sumLng = points.reduce((acc, p) => acc + p[0], 0);
  const sumLat = points.reduce((acc, p) => acc + p[1], 0);
  return {
    lng: sumLng / points.length,
    lat: sumLat / points.length,
  };
}

/**
 * Given a lat/lng and a list of ward features (GeoJSON Feature with Polygon geometry),
 * return the matching ward feature with high precision:
 * 1. Checks all polygons that contain the point.
 * 2. If multiple polygons overlap/touch, selects the ward whose centroid is closest.
 * 3. If point falls just outside polygon boundaries (e.g. GPS drift), snaps to nearest ward within tolerance.
 */
function findWardWithDetail(lat, lng, wardFeatures) {
  const point = [lng, lat];
  const candidates = [];

  for (const feature of wardFeatures) {
    const geom = feature.geometry;
    if (!geom) continue;
    let inside = false;
    if (geom.type === 'Polygon') {
      inside = pointInPolygon(point, geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (pointInPolygon(point, poly[0])) {
          inside = true;
          break;
        }
      }
    }
    if (inside) {
      candidates.push(feature);
    }
  }

  // 1. Single exact polygon containment
  if (candidates.length === 1) {
    return {
      feature: candidates[0],
      matchType: 'polygon',
      precision: 'exact',
      candidatesCount: 1,
    };
  }

  // 2. Multiple polygon overlap: disambiguate by nearest centroid
  if (candidates.length > 1) {
    let best = candidates[0];
    let bestDist = Infinity;
    for (const c of candidates) {
      const centroid = getFeatureCentroid(c);
      const d = distanceMeters(lat, lng, centroid.lat, centroid.lng);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return {
      feature: best,
      matchType: 'polygon_disambiguated',
      precision: 'high',
      candidatesCount: candidates.length,
      distanceMeters: Math.round(bestDist),
    };
  }

  // 3. Point slightly outside mapped boundary (GPS drift up to 3000m)
  let nearest = null;
  let minDist = 3000;
  for (const feature of wardFeatures) {
    const centroid = getFeatureCentroid(feature);
    const d = distanceMeters(lat, lng, centroid.lat, centroid.lng);
    if (d < minDist) {
      minDist = d;
      nearest = feature;
    }
  }

  if (nearest) {
    return {
      feature: nearest,
      matchType: 'proximity',
      precision: 'snapped',
      distanceMeters: Math.round(minDist),
    };
  }

  return null;
}

function findWard(lat, lng, wardFeatures) {
  const detail = findWardWithDetail(lat, lng, wardFeatures);
  return detail ? detail.feature : null;
}

/**
 * Very simple greedy geo-clustering: groups points that are within `radiusMeters`
 * of a cluster's seed point. Good enough for "batch dispatch" demo purposes.
 * points: array of { id, lat, lng, ...rest }
 * returns: array of clusters, each { center: {lat,lng}, members: [points] }
 */
function greedyCluster(points, radiusMeters = 200) {
  const remaining = [...points];
  const clusters = [];
  while (remaining.length) {
    const seed = remaining.shift();
    const members = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const p = remaining[i];
      if (distanceMeters(seed.lat, seed.lng, p.lat, p.lng) <= radiusMeters) {
        members.push(p);
        remaining.splice(i, 1);
      }
    }
    const centerLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const centerLng = members.reduce((s, m) => s + m.lng, 0) / members.length;
    clusters.push({ center: { lat: centerLat, lng: centerLng }, members });
  }
  return clusters;
}

module.exports = { distanceMeters, pointInPolygon, findWard, findWardWithDetail, getFeatureCentroid, greedyCluster };
