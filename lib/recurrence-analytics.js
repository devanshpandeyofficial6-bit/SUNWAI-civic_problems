'use strict';

/**
 * recurrence-analytics.js
 * Predictive Infrastructure Recurrence Hotspots & Contractor Accountability Scorecards.
 * 
 * Analyzes historical ticket spatio-temporal distribution to detect chronic road/sanitation
 * failure zones and evaluates contractor resolution reliability.
 */

const { distanceMeters } = require('./geo');

const RECURRENCE_RADIUS_M = 25; // 25 meters defines the exact same road segment or corner
const RECURRENCE_WINDOW_DAYS = 180; // Past 6 months

function analyzeRecurrenceHotspots(reports = []) {
  const activeAndClosed = reports.filter((r) => r.lat && r.lng);
  const now = new Date().getTime();
  const windowMs = RECURRENCE_WINDOW_DAYS * 86400000;

  const recentReports = activeAndClosed.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return now - t <= windowMs;
  });

  const hotspots = [];
  const visited = new Set();

  for (let i = 0; i < recentReports.length; i++) {
    if (visited.has(recentReports[i].id)) continue;
    const anchor = recentReports[i];
    const group = [anchor];
    visited.add(anchor.id);

    for (let j = i + 1; j < recentReports.length; j++) {
      if (visited.has(recentReports[j].id)) continue;
      const candidate = recentReports[j];

      if (anchor.category === candidate.category) {
        const d = distanceMeters(anchor.lat, anchor.lng, candidate.lat, candidate.lng);
        if (d <= RECURRENCE_RADIUS_M) {
          group.push(candidate);
          visited.add(candidate.id);
        }
      }
    }

    if (group.length >= 2) {
      const avgLat = group.reduce((s, r) => s + r.lat, 0) / group.length;
      const avgLng = group.reduce((s, r) => s + r.lng, 0) / group.length;

      let diagnosis = 'Repeated infrastructure failure at exact location.';
      let priority = 'ELEVATED';

      if (anchor.category === 'pothole') {
        diagnosis = 'Sub-base soil instability or poor drainage causing chronic asphalt cavitation.';
        priority = 'HIGH_RECURRENCE';
      } else if (anchor.category === 'garbage') {
        diagnosis = 'Chronic unauthorized commercial dumping point; requires CCTV or dedicated collection bin.';
        priority = 'CHRONIC_DUMPING';
      } else if (anchor.category === 'water_leakage') {
        diagnosis = 'Aged municipal water trunkline corrosion; requires pipe section replacement.';
        priority = 'HIGH_RECURRENCE';
      }

      hotspots.push({
        hotspotId: `HOTSPOT-${anchor.category.toUpperCase().slice(0, 3)}-${hotspots.length + 1}`,
        category: anchor.category,
        recurrenceCount: group.length,
        center: { lat: Math.round(avgLat * 10000) / 10000, lng: Math.round(avgLng * 10000) / 10000 },
        wardId: anchor.wardId,
        wardName: anchor.wardName,
        diagnosis,
        priority,
        ticketIds: group.map((r) => r.id),
        earliestDate: group[0].createdAt,
        latestDate: group[group.length - 1].createdAt,
      });
    }
  }

  hotspots.sort((a, b) => b.recurrenceCount - a.recurrenceCount);
  return hotspots;
}

function computeContractorScorecards(reports = [], employees = []) {
  const departmentBuckets = {
    'PWD Road Maintenance': { assigned: 0, resolved: 0, disputed: 0, totalHours: 0, onTime: 0 },
    'Kanpur Nagar Nigam Sanitation': { assigned: 0, resolved: 0, disputed: 0, totalHours: 0, onTime: 0 },
    'Jal Sansthan Water Works': { assigned: 0, resolved: 0, disputed: 0, totalHours: 0, onTime: 0 },
    'Municipal Electrical Services': { assigned: 0, resolved: 0, disputed: 0, totalHours: 0, onTime: 0 },
    'Central Municipal Operations': { assigned: 0, resolved: 0, disputed: 0, totalHours: 0, onTime: 0 },
  };

  const categoryDeptMap = {
    pothole: 'PWD Road Maintenance',
    garbage: 'Kanpur Nagar Nigam Sanitation',
    water_leakage: 'Jal Sansthan Water Works',
    streetlight: 'Municipal Electrical Services',
    broken_infrastructure: 'PWD Road Maintenance',
    other: 'Central Municipal Operations',
  };

  for (const r of reports) {
    const dept = categoryDeptMap[r.category] || 'Central Municipal Operations';
    const b = departmentBuckets[dept];
    b.assigned += 1;

    if (['resolved', 'closed'].includes(r.status)) {
      b.resolved += 1;
      const start = new Date(r.createdAt).getTime();
      const end = new Date(r.updatedAt || r.createdAt).getTime();
      const hours = Math.max(1, (end - start) / 3600000);
      b.totalHours += hours;

      const slaHours = r.slaHours || 72;
      if (hours <= slaHours) {
        b.onTime += 1;
      }
    }

    if (r.verification && r.verification.status === 'disputed') {
      b.disputed += 1;
    }
  }

  const scorecards = Object.entries(departmentBuckets).map(([name, stats], idx) => {
    const avgHours = stats.resolved > 0 ? Math.round((stats.totalHours / stats.resolved) * 10) / 10 : 0;
    const slaRate = stats.resolved > 0 ? Math.round((stats.onTime / stats.resolved) * 100) : 100;
    const disputeRate = stats.resolved > 0 ? Math.round((stats.disputed / stats.resolved) * 100) : 0;

    let grade = 'A+';
    let badgeColor = '#059669';
    if (disputeRate > 15 || slaRate < 70) {
      grade = 'D (Audit Flagged)';
      badgeColor = '#dc2626';
    } else if (disputeRate > 8 || slaRate < 85) {
      grade = 'C (Fair)';
      badgeColor = '#d97706';
    } else if (slaRate < 95) {
      grade = 'B (Good)';
      badgeColor = '#0284c7';
    }

    return {
      id: `CTR-${idx + 101}`,
      departmentName: name,
      assignedCount: stats.assigned,
      resolvedCount: stats.resolved,
      avgResolutionHours: avgHours,
      slaComplianceRate: slaRate,
      disputeRate,
      reliabilityGrade: grade,
      badgeColor,
    };
  });

  return scorecards;
}

module.exports = {
  analyzeRecurrenceHotspots,
  computeContractorScorecards,
};
