'use strict';

/**
 * cost-estimator.js
 * Municipal Schedule of Rates (SoR) Civil Works Budget Estimator.
 * 
 * Maps defect dimensions and category classifications into realistic
 * repair budget estimates, material requirements, and urgency SLAs based on
 * standard Indian Public Works Department (PWD) & Swachh Bharat Mission (SBM) norms.
 */

const SOR_SCHEDULES = {
  pothole: {
    name: 'PWD Road Patchwork SoR (Bituminous Macadam)',
    baseTackCoatRate: 450, // Base site mobilization and emulsion tack coat (INR)
    coldMixPerKg: 75,      // Standard polymer modified cold mix asphalt per kg (INR)
    laborFactor: 1.25,     // Compaction roller and skilled mason factor
    defaultDepthMm: 45,    // Average pothole cavity depth
    densityKgM3: 2400,     // Density of dense bituminous macadam (kg/m^3)
  },
  garbage: {
    name: 'Municipal Solid Waste Management SoR (SBM 2.0)',
    collectionPerTonne: 1200, // Collection, mechanized loading, and transport (INR)
    disinfectionBase: 350,    // Lime powder / biocide spraying per site (INR)
    densityTonneM3: 0.45,     // Average municipal uncompacted waste density
    defaultHeapHeightM: 0.35, // Average litter pile height
  },
  streetlight: {
    name: 'Municipal Electrical Infrastructure SoR',
    standardFix: 1450,        // LED driver replacement or 45W luminaire repair
    majorReplacement: 3200,   // Bracket replacement, cabling, and luminaire
  },
  water_leakage: {
    name: 'Jal Sansthan Urban Water Supply Maintenance SoR',
    minorClampFix: 2800,      // Surface pipe split collar clamp + gasket
    excavationRepair: 5400,   // Asphalt trenching, pipe replacement, and backfill
  },
  broken_infrastructure: {
    name: 'PWD Structural & Safety Infrastructure SoR',
    guardrailWelding: 2200,   // Steel railing structural welding and alignment
    concreteCurbPatch: 3500,  // Reinforced concrete pedestrian curb reconstruction
  },
};

function estimateDefectBudget(category, surfaceAreaM2 = 0.25, severityLevel = 3) {
  const cat = (category || 'other').toLowerCase();
  const area = Math.max(0.05, parseFloat(surfaceAreaM2) || 0.25);

  switch (cat) {
    case 'pothole': {
      const sor = SOR_SCHEDULES.pothole;
      const depthM = (severityLevel >= 4 ? 0.065 : (severityLevel === 3 ? 0.045 : 0.030));
      const asphaltKg = Math.round(area * depthM * sor.densityKgM3 * 10) / 10;
      const materialCost = asphaltKg * sor.coldMixPerKg;
      const totalCost = Math.round((sor.baseTackCoatRate + materialCost) * sor.laborFactor);

      return {
        estimatedCostInr: totalCost,
        formattedCost: `₹${totalCost.toLocaleString('en-IN')}`,
        scheduleName: sor.name,
        materialRequirement: `${asphaltKg} kg Cold-Mix Bitumen + Tack Coat`,
        surfaceAreaM2: Math.round(area * 100) / 100,
        depthMm: Math.round(depthM * 1000),
        urgencySlaHours: severityLevel >= 4 ? 24 : 72,
        recommendedAction: severityLevel >= 4 ? 'Emergency Cold-Mix Compaction' : 'Routine Patch Maintenance',
      };
    }

    case 'garbage': {
      const sor = SOR_SCHEDULES.garbage;
      const volumeM3 = area * sor.defaultHeapHeightM;
      const tonnes = Math.max(0.15, Math.round(volumeM3 * sor.densityTonneM3 * 100) / 100);
      const totalCost = Math.round(tonnes * sor.collectionPerTonne + sor.disinfectionBase);

      return {
        estimatedCostInr: totalCost,
        formattedCost: `₹${totalCost.toLocaleString('en-IN')}`,
        scheduleName: sor.name,
        materialRequirement: `~${tonnes} Tonnes Removal & Lime Disinfection`,
        surfaceAreaM2: Math.round(area * 100) / 100,
        urgencySlaHours: severityLevel >= 4 ? 24 : 48,
        recommendedAction: tonnes > 0.5 ? 'Mechanized Compactor Truck Dispatch' : 'Sanitation Team Collection',
      };
    }

    case 'streetlight': {
      const sor = SOR_SCHEDULES.streetlight;
      const cost = severityLevel >= 4 ? sor.majorReplacement : sor.standardFix;
      return {
        estimatedCostInr: cost,
        formattedCost: `₹${cost.toLocaleString('en-IN')}`,
        scheduleName: sor.name,
        materialRequirement: severityLevel >= 4 ? 'Complete 70W Luminaire & Bracket' : '45W LED Driver / Ignitor Replacement',
        surfaceAreaM2: 0,
        urgencySlaHours: 48,
        recommendedAction: 'Electrical Lineman Dispatch with Cherry Picker',
      };
    }

    case 'water_leakage': {
      const sor = SOR_SCHEDULES.water_leakage;
      const cost = severityLevel >= 4 ? sor.excavationRepair : sor.minorClampFix;
      return {
        estimatedCostInr: cost,
        formattedCost: `₹${cost.toLocaleString('en-IN')}`,
        scheduleName: sor.name,
        materialRequirement: severityLevel >= 4 ? 'Excavation & Ductile Iron Collar Clamp' : 'External Split-Sleeve Pipe Clamp',
        surfaceAreaM2: Math.round(area * 100) / 100,
        urgencySlaHours: 24,
        recommendedAction: 'Emergency Water Valve Shutdown & Pipeline Crew',
      };
    }

    case 'broken_infrastructure': {
      const sor = SOR_SCHEDULES.broken_infrastructure;
      const cost = severityLevel >= 4 ? sor.concreteCurbPatch : sor.guardrailWelding;
      return {
        estimatedCostInr: cost,
        formattedCost: `₹${cost.toLocaleString('en-IN')}`,
        scheduleName: sor.name,
        materialRequirement: 'Structural Steel Replacement & High-Strength Concrete',
        surfaceAreaM2: Math.round(area * 100) / 100,
        urgencySlaHours: 72,
        recommendedAction: 'PWD Highway Safety Reconstruction',
      };
    }

    default:
      return {
        estimatedCostInr: 600,
        formattedCost: '₹600',
        scheduleName: 'General Municipal Maintenance Schedule',
        materialRequirement: 'On-site Inspection & Manual Triage',
        surfaceAreaM2: 0,
        urgencySlaHours: 120,
        recommendedAction: 'Ward Field Inspector Verification',
      };
  }
}

module.exports = {
  estimateDefectBudget,
  SOR_SCHEDULES,
};
