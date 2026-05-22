const Audit = require('../models/Audit');
const TemperatureCompliance = require('../models/TemperatureCompliance');
const VendorRating = require('../models/VendorRating');
const QCCheck = require('../models/QCCheck');
const Certificate = require('../models/Certificate');
const Vendor = require('../models/Vendor');
const logger = require('../../core/utils/logger');
const asyncHandler = require('../../middleware/asyncHandler');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');

/**
 * Get all audits
 */
const getAudits = asyncHandler(async (req, res) => {
  const { vendorId, auditType, result, startDate, endDate } = req.query;
  
  const filter = {};
  if (vendorId) filter.vendorId = vendorId;
  if (auditType) filter.auditType = auditType;
  if (result) filter.result = result;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const audits = await Audit.find(mergeHubFilter(filter))
    .sort({ date: -1 })
    .lean();

  const vendorIds = [...new Set(audits.map((a) => String(a.vendorId)).filter(Boolean))];
  const vendors = await Vendor.find(mergeHubFilter({ _id: { $in: vendorIds } }))
    .select('name vendorName')
    .lean();
  const nameById = Object.fromEntries(
    vendors.map((v) => [String(v._id), v.vendorName || v.name || String(v._id)])
  );

  res.json({
    success: true,
    data: audits.map(audit => ({
      ...audit,
      id: audit._id.toString(),
      vendor: nameById[audit.vendorId] || audit.vendorName || audit.vendorId,
      vendorName: nameById[audit.vendorId] || audit.vendorName,
      date: audit.date ? new Date(audit.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null,
    })),
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get audit by ID
 */
const getAuditById = asyncHandler(async (req, res) => {
  const audit = await Audit.findOne(mergeHubFilter({ _id: req.params.id })).lean();
  
  if (!audit) {
    return res.status(404).json({
      success: false,
      message: 'Audit not found',
    });
  }

  res.json({
    success: true,
    data: {
      ...audit,
      id: audit._id.toString(),
      date: audit.date ? new Date(audit.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Create audit
 */
const createAudit = asyncHandler(async (req, res) => {
  const auditData = {
    ...req.body,
    auditId: req.body.auditId || `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  const audit = new Audit({ ...auditData, ...hubFieldsForCreate() });
  await audit.save();

  res.status(201).json({
    success: true,
    data: {
      ...audit.toObject(),
      id: audit._id.toString(),
      date: audit.date ? new Date(audit.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get temperature compliance data
 */
const getTemperatureCompliance = asyncHandler(async (req, res) => {
  const { vendorId, shipmentId, compliant } = req.query;
  
  const filter = {};
  if (vendorId) filter.vendorId = vendorId;
  if (shipmentId) filter.shipmentId = shipmentId;
  if (compliant !== undefined) filter.compliant = compliant === 'true';

  const temps = await TemperatureCompliance.find(mergeHubFilter(filter))
    .sort({ createdAt: -1 })
    .lean();

  const vendorIds = [...new Set(temps.map((x) => String(x.vendorId)).filter(Boolean))];
  const vendors = await Vendor.find(mergeHubFilter({ _id: { $in: vendorIds } }))
    .select('name vendorName')
    .lean();
  const nameById = Object.fromEntries(
    vendors.map((v) => [String(v._id), v.vendorName || v.name || String(v._id)])
  );

  res.json({
    success: true,
    data: temps.map(temp => ({
      ...temp,
      id: temp._id.toString(),
      vendor: nameById[temp.vendorId] || temp.vendorName || temp.vendorId,
      vendorName: nameById[temp.vendorId] || temp.vendorName,
    })),
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Create temperature compliance record
 */
const createTemperatureCompliance = asyncHandler(async (req, res) => {
  const tempData = req.body;
  
  // Calculate compliance
  if (tempData.readings && tempData.readings.length > 0) {
    const temps = tempData.readings.map(r => r.temperature);
    tempData.avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    tempData.minTemp = Math.min(...temps);
    tempData.maxTemp = Math.max(...temps);
    
    // Parse requirement (e.g., "2-8°C" or "-18°C")
    const reqMatch = tempData.requirement.match(/(-?\d+)\s*-\s*(-?\d+)|(-?\d+)/);
    if (reqMatch) {
      const minReq = reqMatch[1] ? parseFloat(reqMatch[1]) : (reqMatch[3] ? parseFloat(reqMatch[3]) - 2 : null);
      const maxReq = reqMatch[2] ? parseFloat(reqMatch[2]) : (reqMatch[3] ? parseFloat(reqMatch[3]) + 2 : null);
      
      if (minReq !== null && maxReq !== null) {
        tempData.compliant = tempData.minTemp >= minReq && tempData.maxTemp <= maxReq;
        
        // Find violations
        tempData.violations = tempData.readings
          .filter(r => r.temperature < minReq || r.temperature > maxReq)
          .map(r => ({
            timestamp: r.timestamp,
            temperature: r.temperature,
            severity: Math.abs(r.temperature - (minReq + maxReq) / 2) > (maxReq - minReq) ? 'critical' : 'major',
          }));
      }
    }
  }

  const temp = new TemperatureCompliance({ ...tempData, ...hubFieldsForCreate() });
  await temp.save();

  res.status(201).json({
    success: true,
    data: {
      ...temp.toObject(),
      id: temp._id.toString(),
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Update temperature compliance (approve anyway / reject)
 */
const patchTemperatureCompliance = asyncHandler(async (req, res) => {
  const { tempId } = req.params;
  const { compliant, notes } = req.body;

  const temp = await TemperatureCompliance.findOne(mergeHubFilter({ _id: tempId }));
  if (!temp) {
    return res.status(404).json({
      success: false,
      message: 'Temperature compliance record not found',
    });
  }

  if (compliant !== undefined) temp.compliant = compliant;
  if (notes !== undefined) {
    temp.metadata = temp.metadata || {};
    temp.metadata.notes = notes;
  }
  await temp.save();

  res.json({
    success: true,
    data: {
      ...temp.toObject(),
      id: temp._id.toString(),
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get vendor ratings
 */
const getVendorRatings = asyncHandler(async (req, res) => {
  const { vendorId } = req.query;
  
  const filter = {};
  if (vendorId) filter.vendorId = vendorId;

  let ratings = await VendorRating.find(mergeHubFilter(filter)).lean();

  // If no ratings exist, calculate them
  if (ratings.length === 0 && vendorId) {
    ratings = [await calculateVendorRating(vendorId)];
  } else if (!vendorId) {
    // Calculate ratings for all vendors
    const vendors = await Vendor.find(mergeHubFilter({ archived: false })).lean();
    ratings = await Promise.all(vendors.map(v => calculateVendorRating(v._id.toString())));
  }

  res.json({
    success: true,
    data: ratings.map(rating => ({
      ...rating,
      id: rating._id ? rating._id.toString() : rating.vendorId,
      vendor: rating.vendorName || 'Unknown',
    })),
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Calculate vendor rating
 */
async function calculateVendorRating(vendorId) {
  const [qcChecks, audits, vendor] = await Promise.all([
    QCCheck.find(mergeHubFilter({ vendorId })).lean(),
    Audit.find(mergeHubFilter({ vendorId })).lean(),
    Vendor.findOne(mergeHubFilter({ _id: vendorId })).lean(),
  ]);

  const totalQCChecks = qcChecks.length;
  const passedQCChecks = qcChecks.filter(c => c.status === 'passed' || c.status === 'approved').length;
  const qcPassRate = totalQCChecks > 0 ? (passedQCChecks / totalQCChecks) * 100 : 0;

  const auditScores = audits.filter(a => a.score !== undefined).map(a => a.score);
  const avgAuditScore = auditScores.length > 0 
    ? auditScores.reduce((a, b) => a + b, 0) / auditScores.length 
    : 0;

  // Compliance score based on certificates
  const certificates = await Certificate.find(mergeHubFilter({ vendorId, status: 'valid' })).lean();
  const complianceScore = Math.min(100, certificates.length * 20); // Simple calculation

  // Overall rating
  const overallRating = ((qcPassRate / 100) * 2.5 + (avgAuditScore / 100) * 2.5) / 5;

  // Determine trend (simplified - compare recent vs older data)
  const recentQCChecks = qcChecks.filter(c => {
    const checkDate = new Date(c.createdAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return checkDate >= thirtyDaysAgo;
  });
  const recentPassRate = recentQCChecks.length > 0
    ? (recentQCChecks.filter(c => c.status === 'passed' || c.status === 'approved').length / recentQCChecks.length) * 100
    : qcPassRate;
  
  let trend = 'stable';
  if (recentPassRate > qcPassRate + 5) trend = 'up';
  else if (recentPassRate < qcPassRate - 5) trend = 'down';

  const ratingData = {
    vendorId,
    overallRating: Math.round(overallRating * 10) / 10,
    qcPassRate: Math.round(qcPassRate * 10) / 10,
    complianceScore: Math.round(complianceScore),
    auditScore: Math.round(avgAuditScore),
    trend,
    vendorName: vendor?.name,
  };

  // Save or update rating
  await VendorRating.findOneAndUpdate(
    mergeHubFilter({ vendorId }),
    {
      $set: { ...ratingData, calculatedAt: new Date() },
      $setOnInsert: hubFieldsForCreate(),
    },
    { upsert: true, new: true }
  );

  return ratingData;
}

/**
 * Recalculate vendor rating
 */
const recalculateVendorRating = asyncHandler(async (req, res) => {
  const { vendorId } = req.params;
  const rating = await calculateVendorRating(vendorId);
  
  res.json({
    success: true,
    data: {
      ...rating,
      id: rating.vendorId,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});



const getHubCertificates = asyncHandler(async (req, res) => {
  const certs = await Certificate.find(mergeHubFilter({}))
    .sort({ expiresAt: 1 })
    .lean();
  const vendorIds = [...new Set(certs.map((c) => String(c.vendorId)).filter(Boolean))];
  const vendors = await Vendor.find(mergeHubFilter({ _id: { $in: vendorIds } }))
    .select('name vendorName')
    .lean();
  const nameById = Object.fromEntries(
    vendors.map((v) => [String(v._id), v.vendorName || v.name || String(v._id)])
  );

  res.json({
    success: true,
    data: certs.map((c) => {
      const daysToExpiry = c.expiresAt
        ? Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / (86400000))
        : 0;
      let status = c.status || 'valid';
      if (status === 'valid' && daysToExpiry <= 30 && daysToExpiry > 0) status = 'expiring_soon';
      if (daysToExpiry <= 0 && c.expiresAt) status = 'expired';
      return {
        ...c,
        id: c._id.toString(),
        vendor: nameById[c.vendorId] || c.vendorId,
        vendorName: nameById[c.vendorId] || c.vendorId,
        certificateType: c.type || c.certificateType,
        daysToExpiry,
        status,
      };
    }),
    meta: { requestId: req.id, timestamp: new Date().toISOString() },
  });
});




const updateAudit = asyncHandler(async (req, res) => {
  const audit = await Audit.findOneAndUpdate(
    mergeHubFilter({ _id: req.params.id }),
    { $set: req.body },
    { new: true }
  ).lean();
  if (!audit) {
    return res.status(404).json({ success: false, message: 'Audit not found' });
  }
  res.json({
    success: true,
    data: { ...audit, id: audit._id.toString() },
  });
});

const deleteAudit = asyncHandler(async (req, res) => {
  const removed = await Audit.findOneAndDelete(mergeHubFilter({ _id: req.params.id }));
  if (!removed) {
    return res.status(404).json({ success: false, message: 'Audit not found' });
  }
  res.json({ success: true });
});

const deleteTemperatureCompliance = asyncHandler(async (req, res) => {
  const removed = await TemperatureCompliance.findOneAndDelete(
    mergeHubFilter({ _id: req.params.tempId })
  );
  if (!removed) {
    return res.status(404).json({ success: false, message: 'Temperature record not found' });
  }
  res.json({ success: true });
});

const createHubCertificate = asyncHandler(async (req, res) => {
  const certificateService = require('../services/certificateService');
  const { vendorId, ...rest } = req.body;
  if (!vendorId) {
    return res.status(400).json({ success: false, message: 'vendorId is required' });
  }
  const created = await certificateService.createCertificate(vendorId, rest);
  res.status(201).json({ success: true, data: { ...created, id: String(created._id) } });
});

const updateHubCertificate = asyncHandler(async (req, res) => {
  const certificateService = require('../services/certificateService');
  const updated = await certificateService.updateCertificate(req.params.certId, req.body);
  res.json({ success: true, data: { ...updated, id: String(updated._id) } });
});

const deleteHubCertificate = asyncHandler(async (req, res) => {
  const certificateService = require('../services/certificateService');
  await certificateService.deleteCertificate(req.params.certId);
  res.json({ success: true });
});

const updateVendorRating = asyncHandler(async (req, res) => {
  const { vendorId } = req.params;
  const vendor = await Vendor.findOne(mergeHubFilter({ _id: vendorId })).lean();
  const payload = {
    vendorId,
    vendorName: vendor?.name || vendor?.vendorName,
    overallRating: req.body.overallRating,
    qcPassRate: req.body.qcPassRate,
    complianceScore: req.body.complianceScore,
    auditScore: req.body.auditScore,
    trend: req.body.trend || 'stable',
    calculatedAt: new Date(),
  };
  const rating = await VendorRating.findOneAndUpdate(
    mergeHubFilter({ vendorId }),
    { $set: payload, $setOnInsert: hubFieldsForCreate() },
    { new: true, upsert: true }
  ).lean();
  res.json({
    success: true,
    data: { ...rating, id: rating._id ? String(rating._id) : vendorId, vendor: rating.vendorName },
  });
});

const deleteVendorRating = asyncHandler(async (req, res) => {
  await VendorRating.findOneAndDelete(mergeHubFilter({ vendorId: req.params.vendorId }));
  res.json({ success: true });
});


module.exports = {
  getAudits,
  getAuditById,
  createAudit,
  getTemperatureCompliance,
  createTemperatureCompliance,
  patchTemperatureCompliance,
  getVendorRatings,
  recalculateVendorRating,
  getHubCertificates,
  updateAudit,
  deleteAudit,
  deleteTemperatureCompliance,
  createHubCertificate,
  updateHubCertificate,
  deleteHubCertificate,
  updateVendorRating,
  deleteVendorRating,
};
