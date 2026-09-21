'use strict';

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; 
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

  if (candidates.length === 1) {
    return {
      feature: candidates[0],
      matchType: 'polygon',
      precision: 'exact',
      candidatesCount: 1,
    };
  }

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
