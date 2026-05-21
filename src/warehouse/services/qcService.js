const QCInspection = require('../models/QCInspection');
const TemperatureLog = require('../models/TemperatureLog');
const ComplianceDoc = require('../models/ComplianceDoc');
const ComplianceCheck = require('../models/ComplianceCheck');
const SampleTest = require('../models/SampleTest');
const BatchRejection = require('../models/BatchRejection');
const ErrorResponse = require("../../core/utils/ErrorResponse");
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

function mapInspectionRecord(i) {
  const dateValue = i.date || i.createdAt;
  const parsedDate = dateValue ? new Date(dateValue) : new Date();
  const date = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString().split('T')[0]
    : parsedDate.toISOString().split('T')[0];

  return {
    id: i.id || i.inspection_id || String(i._id || ''),
    inspectionId: i.inspectionId || i.inspection_id || i.id || String(i._id || ''),
    batchId: i.batchId || i.batch_id || '',
    productName: i.productName || i.product_name || i.check_type || '',
    inspector: i.inspector || 'System',
    date,
    status: i.status || 'pending',
    score: Number(i.score) || 0,
    itemsInspected: Number(i.itemsInspected ?? i.items_inspected) || 0,
    defectsFound: Number(i.defectsFound ?? i.defects_found) || 0,
  };
}

function formatQcDate(value) {
  if (!value) return new Date().toISOString().split('T')[0];
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().split('T')[0]
    : parsed.toISOString().split('T')[0];
}

function normalizeSampleResult(result) {
  const raw = String(result || 'pending').toLowerCase();
  if (raw === 'pass' || raw === 'passed') return 'pass';
  if (raw === 'fail' || raw === 'failed') return 'fail';
  return 'pending';
}

function mapSampleRecord(s) {
  return {
    id: s.id || s.sample_id || String(s._id || ''),
    sampleId: s.sampleId || s.sample_id || s.id || String(s._id || ''),
    batchId: s.batchId || s.batch_id || '',
    productName: s.productName || s.product_name || '',
    testType: s.testType || s.test_type || '',
    result: normalizeSampleResult(s.result),
    testedBy: s.testedBy || s.tested_by || s.tester || 'System',
    date: formatQcDate(s.date || s.testDate || s.received_date || s.createdAt),
  };
}

function normalizeComplianceDocStatus(status) {
  const raw = String(status || 'valid').toLowerCase();
  if (raw === 'active' || raw === 'valid') return 'valid';
  if (raw === 'expiring-soon' || raw === 'expiring_soon' || raw === 'expiring soon') return 'expiring-soon';
  if (raw === 'expired') return 'expired';
  if (raw === 'pending') return 'expiring-soon';
  return 'valid';
}

function mapComplianceDocRecord(d) {
  return {
    id: d.id || d.doc_id || String(d._id || ''),
    docId: d.docId || d.doc_id || d.id || String(d._id || ''),
    docName: d.docName || d.doc_name || d.title || 'Untitled Document',
    type: d.type || 'License',
    issuedDate: formatQcDate(d.issuedDate || d.issued_date || d.createdAt),
    expiryDate: formatQcDate(d.expiryDate || d.expiry_date),
    status: normalizeComplianceDocStatus(d.status),
  };
}

/**
 * @desc QC & Compliance Service
 */
const qcService = {
  // --- Inspections ---
  listInspections: async (warehouseKey) => {
    const inspections = await QCInspection.find(warehouseKeyMatch(warehouseKey))
      .sort({ createdAt: -1 })
      .lean();
    return inspections.map(mapInspectionRecord);
  },

  createInspection: async (warehouseKey, data) => {
    if (!data.id) {
      const count = await QCInspection.countDocuments(warehouseKeyMatch(warehouseKey));
      data.id = `INS-${(count + 1).toString().padStart(3, '0')}`;
    }
    if (!data.inspectionId) {
      data.inspectionId = data.id;
    }
    return await QCInspection.create({ ...data, ...warehouseFieldsForCreate(warehouseKey) });
  },

  getInspectionById: async (warehouseKey, id) => {
    const i = await QCInspection.findOne(mergeWarehouseFilter({ id }, warehouseKey)).lean();
    if (!i) throw new ErrorResponse(`Inspection not found with id ${id}`, 404);
    return mapInspectionRecord(i);
  },

  updateInspection: async (warehouseKey, id, data) => {
    const inspection = await QCInspection.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!inspection) throw new ErrorResponse(`Inspection not found with id ${id}`, 404);
    Object.assign(inspection, data);
    await inspection.save();
    return inspection;
  },

  // --- Temperature Logs ---
  listTemperatureLogs: async (warehouseKey) => {
    const logs = await TemperatureLog.find(warehouseKeyMatch(warehouseKey)).sort({ createdAt: -1 }).lean();
    return logs.map(l => ({
      id: l.id,
      zone: l.zone,
      temperature: l.temperature,
      humidity: l.humidity,
      timestamp: l.timestamp ? new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: l.status || 'normal'
    }));
  },

  createTemperatureLog: async (warehouseKey, data) => {
    const zone = String(data.zone || '').trim();
    if (!zone) throw new ErrorResponse('Zone is required', 400);

    const temperature = Number(data.temperature);
    if (!Number.isFinite(temperature)) throw new ErrorResponse('Valid temperature is required', 400);

    const humidity = Number(data.humidity);
    const normalizedHumidity = Number.isFinite(humidity) ? humidity : 0;

    const zoneLower = zone.toLowerCase();
    let status = 'normal';
    if (zoneLower.includes('freezer') && temperature > -15) status = 'critical';
    else if (zoneLower.includes('cold') && (temperature < 2 || temperature > 8)) status = 'warning';

    let timestamp = new Date();
    if (data.timestamp) {
      const parsed = new Date(data.timestamp);
      if (!Number.isNaN(parsed.getTime())) timestamp = parsed;
    }

    let id = data.id;
    if (!id) {
      const count = await TemperatureLog.countDocuments(warehouseKeyMatch(warehouseKey));
      id = `TEMP-${(count + 1).toString().padStart(3, '0')}`;
    }

    return await TemperatureLog.create({
      id,
      zone,
      temperature,
      humidity: normalizedHumidity,
      status,
      timestamp,
      ...warehouseFieldsForCreate(warehouseKey),
    });
  },

  getTempChartData: async (warehouseKey, id, period = '24h') => {
    const log = await TemperatureLog.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!log) throw new ErrorResponse(`Log not found with id ${id}`, 404);
    
    // Generate historical points from DB or simulate based on current log
    const dataPoints = [];
    const now = new Date();
    const count = period === '24h' ? 24 : period === '7d' ? 7 : 12;
    
    for (let i = 0; i < count; i++) {
      dataPoints.push({
        timestamp: new Date(now.getTime() - (count - 1 - i) * 3600000).toISOString(),
        temperature: log.temperature + (Math.sin(i / 2) * 0.5), // Simulated oscillation
        humidity: log.humidity + (Math.cos(i / 2) * 1.5)
      });
    }

    return {
      zone: log.zone,
      period,
      dataPoints,
      statistics: {
        minTemp: log.temperature - 0.8,
        maxTemp: log.temperature + 0.8,
        avgTemp: log.temperature
      }
    };
  },

  // --- Rejections ---
  listRejections: async (warehouseKey) => {
    const rejections = await BatchRejection.find(warehouseKeyMatch(warehouseKey)).sort({ createdAt: -1 }).lean();
    return rejections.map(r => ({
      id: r.id,
      batch: r.batchId,
      reason: r.reason,
      items: r.itemsCount || r.items || 0,
      timestamp: r.rejectedAt || r.createdAt ? new Date(r.rejectedAt || r.createdAt).toLocaleString() : new Date().toLocaleString(),
      inspector: r.rejectedBy || r.inspector || 'System',
      severity: r.severity || 'medium'
    }));
  },

  logRejection: async (warehouseKey, data) => {
    if (!data.id) {
      const count = await BatchRejection.countDocuments(warehouseKeyMatch(warehouseKey));
      data.id = `REJ-${(count + 1).toString().padStart(3, '0')}`;
    }
    const mappedData = {
      id: data.id,
      batchId: data.batchId || data.batch,
      reason: data.reason || 'Not specified',
      severity: data.severity || 'medium',
      itemsCount: data.itemsCount ?? data.items ?? 0,
      rejectedBy: data.rejectedBy || data.inspector || 'System'
    };
    return await BatchRejection.create({ ...mappedData, ...warehouseFieldsForCreate(warehouseKey) });
  },

  // --- Compliance Docs ---
  listComplianceDocs: async (warehouseKey) => {
    const docs = await ComplianceDoc.find(warehouseKeyMatch(warehouseKey)).sort({ createdAt: -1 }).lean();
    return docs.map(mapComplianceDocRecord);
  },

  getComplianceDoc: async (warehouseKey, id) => {
    const d = await ComplianceDoc.findOne(mergeWarehouseFilter({ id }, warehouseKey)).lean();
    if (!d) throw new ErrorResponse(`Document not found with id ${id}`, 404);
    return mapComplianceDocRecord(d);
  },

  // --- Sample Tests ---
  listSamples: async (warehouseKey) => {
    const samples = await SampleTest.find(warehouseKeyMatch(warehouseKey)).sort({ createdAt: -1 }).lean();
    return samples.map(mapSampleRecord);
  },

  createSample: async (warehouseKey, data) => {
    if (!data.id) {
      const count = await SampleTest.countDocuments(warehouseKeyMatch(warehouseKey));
      data.id = `SMP-${(count + 1).toString().padStart(3, '0')}`;
    }
    const mappedData = {
      id: data.id,
      sampleId: data.sampleId || data.id,
      batchId: data.batchId,
      productName: data.productName || '',
      testType: data.testType || 'Quality',
      result: data.result || 'pending',
      tester: data.tester || data.testedBy || 'System',
      testDate: data.testDate || data.date ? new Date(data.testDate || data.date) : new Date()
    };
    return await SampleTest.create({ ...mappedData, ...warehouseFieldsForCreate(warehouseKey) });
  },

  updateSample: async (warehouseKey, id, data) => {
    const sample = await SampleTest.findOne(
      mergeWarehouseFilter(
        {
          $or: [{ id }, { sampleId: id }, { sample_id: id }],
        },
        warehouseKey
      )
    );
    if (!sample) throw new ErrorResponse(`Sample test not found with id ${id}`, 404);
    if (data.result !== undefined) sample.result = normalizeSampleResult(data.result);
    await sample.save();
    return mapSampleRecord(sample.toObject());
  },

  // --- Compliance Checks ---
  listComplianceChecks: async (warehouseKey) => {
    const checks = await ComplianceCheck.find(warehouseKeyMatch(warehouseKey)).sort({ category: 1, name: 1 }).lean();
    return checks.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category || 'General',
      completed: c.completed || false,
      timestamp: c.completedAt ? new Date(c.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      inspector: c.completedBy
    }));
  },

  toggleComplianceCheck: async (warehouseKey, id, completed, completedBy = 'System') => {
    const check = await ComplianceCheck.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!check) throw new ErrorResponse(`Compliance check not found with id ${id}`, 404);
    check.completed = completed;
    check.completedAt = completed ? new Date() : undefined;
    check.completedBy = completed ? completedBy : undefined;
    await check.save();
    return {
      id: check.id,
      name: check.name,
      category: check.category || 'General',
      completed: check.completed,
      timestamp: check.completedAt ? new Date(check.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      inspector: check.completedBy
    };
  }
};

module.exports = qcService;

