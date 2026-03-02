const QCFailure = require('../models/QCFailure');
const WatchlistItem = require('../models/WatchlistItem');
const QCCheckLog = require('../models/QCCheckLog');
const ComplianceLog = require('../models/ComplianceLog');
const AuditStatus = require('../models/AuditStatus');
const AuditLog = require('../models/AuditLog');
const QCInspection = require('../models/QCInspection');
const ComplianceDoc = require('../models/ComplianceDoc');
const SampleTest = require('../models/SampleTest');
const ChecklistItem = require('../models/ChecklistItem');
const { generateId } = require('../../utils/helpers');

const getQCSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    
    // Inspections count and pass rate
    const totalInspections = await QCInspection.countDocuments({ store_id: storeId });
    const passedInspections = await QCInspection.countDocuments({ store_id: storeId, status: 'passed' });
    const passRate = totalInspections > 0 ? Math.round((passedInspections / totalInspections) * 100) : 0;

    // Average temperature
    const recentTempLogs = await ComplianceLog.find({ 
      store_id: storeId, 
      category: 'temperature' 
    }).sort({ logged_at: -1 }).limit(10);
    
    let avgTemp = 0;
    if (recentTempLogs.length > 0) {
      const sumTemp = recentTempLogs.reduce((acc, log) => {
        const temp = parseFloat(log.reading.replace('°C', ''));
        return acc + (isNaN(temp) ? 0 : temp);
      }, 0);
      avgTemp = (sumTemp / recentTempLogs.length).toFixed(1);
    }

    // Compliance checks
    const totalChecks = await ChecklistItem.countDocuments({ store_id: storeId });
    const completedChecks = await ChecklistItem.countDocuments({ store_id: storeId, status: 'completed' });

    // Pending samples
    const pendingSamples = await SampleTest.countDocuments({ store_id: storeId, result: 'pending' });

    // Rejections this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const rejectionsThisWeek = await QCFailure.countDocuments({ 
      store_id: storeId, 
      detected_at: { $gte: oneWeekAgo } 
    });

    res.status(200).json({
      success: true,
      summary: {
        inspections_count: totalInspections,
        pass_rate: passRate,
        avg_temp: avgTemp,
        checks_completed: completedChecks,
        total_checks: totalChecks,
        pending_samples: pendingSamples,
        rejections_this_week: rejectionsThisWeek
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch QC summary',
    });
  }
};

// QC Inspections
const getQCInspections = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const inspections = await QCInspection.find({ store_id: storeId }).sort({ createdAt: -1 });
    res.json({ success: true, inspections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createQCInspection = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { batchId, productName, inspector, itemsInspected, defectsFound } = req.body;
    
    const items = parseInt(itemsInspected) || 0;
    const defects = parseInt(defectsFound) || 0;
    const score = items > 0 ? Math.round(((items - defects) / items) * 100) : 0;
    const status = score >= 80 ? 'passed' : 'failed';

    const inspection = new QCInspection({
      inspection_id: `INS-${Math.floor(Math.random() * 90000) + 10000}`,
      batch_id: batchId,
      product_name: productName,
      inspector: inspector || 'System User',
      date: new Date().toISOString().split('T')[0],
      status,
      score,
      items_inspected: items,
      defects_found: defects,
      store_id: storeId
    });

    await inspection.save();

    // Log Action History
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'qc',
      user: inspector || 'system',
      action: 'CREATE_INSPECTION',
      details: inspection,
      store_id: storeId
    });

    res.status(201).json({ success: true, inspection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Temperature Logs
const getTemperatureLogs = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const logs = await ComplianceLog.find({ 
      store_id: storeId, 
      category: 'temperature' 
    }).sort({ logged_at: -1 });
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createTemperatureLog = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { zone, temperature, humidity, logged_by } = req.body;
    
    const temp = parseFloat(temperature);
    let status = 'normal';
    if (zone.includes('Cold') && (temp < 2 || temp > 8)) status = 'warning';
    if (zone.includes('Freezer') && temp > -15) status = 'critical';

    const log = new ComplianceLog({
      log_id: `LOG-${Date.now().toString().slice(-6)}`,
      category: 'temperature',
      zone,
      reading: `${temperature}°C`,
      threshold: zone.includes('Freezer') ? '-18°C' : '4°C',
      status,
      logged_by: logged_by || 'System User',
      logged_at: new Date(),
      notes: `Humidity: ${humidity}%`,
      store_id: storeId
    });

    await log.save();

    // Log Action History
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'qc',
      user: logged_by || 'system',
      action: 'LOG_TEMPERATURE',
      details: log,
      store_id: storeId
    });

    res.status(201).json({ success: true, log });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Compliance Checklist
const getComplianceChecks = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const checks = await ChecklistItem.find({ store_id: storeId });
    res.json({ success: true, checks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const toggleComplianceCheck = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { completed, inspector } = req.body;
    
    const check = await ChecklistItem.findOneAndUpdate(
      { item_id: itemId },
      { 
        status: completed ? 'completed' : 'pending',
        completed_at: completed ? new Date() : null,
        completed_by: completed ? inspector : null
      },
      { new: true }
    );

    if (!check) return res.status(404).json({ success: false, error: 'Check not found' });

    // Log Action History
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'qc',
      user: inspector || 'system',
      action: 'TOGGLE_CHECK',
      details: check,
      store_id: check.store_id
    });

    res.json({ success: true, check });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Compliance Docs
const getComplianceDocs = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const docs = await ComplianceDoc.find({ store_id: storeId });
    res.json({ success: true, docs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Sample Testing
const getSampleTests = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const samples = await SampleTest.find({ store_id: storeId }).sort({ createdAt: -1 });
    res.json({ success: true, samples });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createSampleTest = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { batchId, productName, testType, testedBy } = req.body;

    const sample = new SampleTest({
      sample_id: `SMP-${Math.floor(Math.random() * 90000) + 10000}`,
      batch_id: batchId,
      product_name: productName,
      test_type: testType,
      result: 'pending',
      tested_by: testedBy || 'Lab User',
      date: new Date().toISOString().split('T')[0],
      store_id: storeId
    });

    await sample.save();

    // Log Action History
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'qc',
      user: testedBy || 'system',
      action: 'CREATE_SAMPLE_TEST',
      details: sample,
      store_id: storeId
    });

    res.status(201).json({ success: true, sample });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateSampleResult = async (req, res) => {
  try {
    const { sampleId } = req.params;
    const { result, testedBy } = req.body;
    
    const sample = await SampleTest.findOneAndUpdate(
      { sample_id: sampleId },
      { result, tested_by: testedBy },
      { new: true }
    );

    if (!sample) return res.status(404).json({ success: false, error: 'Sample not found' });

    // Log Action History
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'qc',
      user: testedBy || 'system',
      action: 'UPDATE_SAMPLE_RESULT',
      details: sample,
      store_id: sample.store_id
    });

    res.json({ success: true, sample });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Rejections (using QCFailure model)
const getRejections = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const rejections = await QCFailure.find({ store_id: storeId }).sort({ detected_at: -1 });
    res.json({ success: true, rejections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createRejection = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { batch, reason, items, severity, inspector } = req.body;

    const rejection = new QCFailure({
      failure_id: `REJ-${Date.now().toString().slice(-6)}`,
      order_id: 'N/A', // For batch rejections, order_id might not be applicable
      product_name: batch, // Using batch name as product_name for UI consistency
      sku: 'BATCH',
      issue: reason,
      severity: severity || 'medium',
      detected_by: inspector || 'System User',
      detected_at: new Date(),
      status: 'pending',
      action_taken: `${items} items rejected`,
      store_id: storeId
    });

    await rejection.save();

    // Log Action History
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'qc',
      user: inspector || 'system',
      action: 'CREATE_REJECTION',
      details: rejection,
      store_id: storeId
    });

    res.status(201).json({ success: true, rejection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getQCFailures = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const severity = req.query.severity || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId, status: 'pending' };
    if (severity !== 'all') {
      query.severity = severity;
    }

    const failures = await QCFailure.find(query)
      .sort({ detected_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await QCFailure.countDocuments(query);

    res.json({
      success: true,
      failures: failures.map((f) => ({
        failure_id: f.failure_id,
        order_id: f.order_id,
        product_name: f.product_name,
        sku: f.sku,
        issue: f.issue,
        severity: f.severity,
        detected_by: f.detected_by,
        detected_at: f.detected_at,
        status: f.status,
      })),
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_items: total,
        items_per_page: limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch QC failures',
    });
  }
};

const getRecentFailures = getQCFailures;

const resolveQCFailure = async (req, res) => {
  try {
    const { failureId } = req.params;
    const { resolution_notes, action_taken } = req.body;

    const failure = await QCFailure.findOneAndUpdate(
      { failure_id: failureId },
      {
        status: 'resolved',
        resolution_notes,
        action_taken,
      },
      { new: true }
    );

    if (!failure) {
      return res.status(404).json({
        success: false,
        error: 'QC failure not found',
      });
    }

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'qc',
      user: req.userId || 'system',
      action: 'RESOLVE_FAILURE',
      details: {
        failure_id: failure.failure_id,
        order_id: failure.order_id,
        product_name: failure.product_name,
        resolution_notes,
        action_taken
      },
      store_id: failure.store_id,
    });

    res.json({
      success: true,
      failure_id: failure.failure_id,
      status: failure.status,
      message: 'QC failure resolved successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to resolve QC failure',
    });
  }
};

const getWatchlist = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    const watchlist = await WatchlistItem.find({ store_id: storeId, status: 'active' }).lean();

    res.json({
      success: true,
      watchlist: watchlist.map((w) => ({
        sku: w.sku,
        product_name: w.product_name,
        reason: w.reason,
        required_check: w.required_check,
        last_check: w.last_check,
        next_check: w.next_check,
        status: w.status,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch watchlist',
    });
  }
};

const addWatchlistItem = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.store_id || process.env.DEFAULT_STORE_ID;
    const { sku, product_name, reason, required_check } = req.body;

    if (!sku || !product_name || !required_check) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sku, product_name, and required_check are mandatory',
      });
    }

    const existing = await WatchlistItem.findOne({ sku, store_id: storeId });
    if (existing) {
      if (existing.status === 'active') {
        return res.status(400).json({
          success: false,
          error: 'SKU already exists in active watchlist',
        });
      } else {
        // Reactivate if inactive
        existing.status = 'active';
        existing.reason = reason || existing.reason;
        existing.required_check = required_check || existing.required_check;
        await existing.save();
        
        return res.json({
          success: true,
          watchlist_item: existing,
          message: 'Watchlist item reactivated successfully',
        });
      }
    }

    const watchlistItem = new WatchlistItem({
      sku,
      product_name,
      reason,
      required_check,
      status: 'active',
      store_id: storeId,
    });

    await watchlistItem.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'qc',
      user: req.userId || 'system',
      action: 'ADD_WATCHLIST_ITEM',
      sku,
      details: {
        sku,
        product_name,
        reason,
        required_check
      },
      store_id: storeId,
    });

    res.status(201).json({
      success: true,
      watchlist_item: {
        sku: watchlistItem.sku,
        product_name: watchlistItem.product_name,
        reason: watchlistItem.reason,
        required_check: watchlistItem.required_check,
        status: watchlistItem.status,
      },
      message: 'Watchlist item added successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add watchlist item',
    });
  }
};

const logQCCheck = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { sku } = req.params;
    const { check_result, check_notes, checked_by } = req.body;

    const checkLog = new QCCheckLog({
      sku,
      store_id: storeId,
      check_result,
      check_notes,
      checked_by,
      checked_at: new Date(),
    });

    await checkLog.save();

    await WatchlistItem.findOneAndUpdate(
      { sku },
      {
        last_check: new Date(),
        next_check: new Date(Date.now() + 2 * 60 * 60 * 1000),
        status: 'acknowledged'
      }
    );

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'data_push',
      module: 'qc',
      user: req.userId || 'system',
      action: 'LOG_CHECK',
      sku,
      details: {
        sku,
        check_result,
        check_notes,
        checked_by
      },
      store_id: storeId,
    });

    res.json({
      success: true,
      check_log: {
        sku: checkLog.sku,
        check_result: checkLog.check_result,
        checked_at: checkLog.checked_at,
        checked_by: checkLog.checked_by,
      },
      message: 'QC check logged successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to log QC check',
    });
  }
};

const getComplianceLogs = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const category = req.query.category || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (category !== 'all') {
      query.category = category;
    }

    const logs = await ComplianceLog.find(query)
      .sort({ logged_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ComplianceLog.countDocuments(query);

    res.json({
      success: true,
      logs: logs.map((l) => ({
        log_id: l.log_id,
        category: l.category,
        zone: l.zone,
        reading: l.reading,
        threshold: l.threshold,
        status: l.status,
        logged_by: l.logged_by,
        logged_at: l.logged_at,
      })),
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_items: total,
        items_per_page: limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch compliance logs',
    });
  }
};

const addComplianceLog = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { category, zone, reading, threshold, logged_by, notes } = req.body;

    const logId = `LOG-${Date.now().toString().slice(-6)}`;
    const status = parseFloat(reading.replace(/[^0-9.-]/g, '')) <= parseFloat(threshold.replace(/[^0-9.-]/g, '')) ? 'ok' : 'warning';

    const logEntry = new ComplianceLog({
      log_id: logId,
      category,
      zone,
      reading,
      threshold,
      status,
      logged_by,
      logged_at: new Date(),
      notes,
      store_id: storeId,
    });

    await logEntry.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'qc',
      user: req.userId || 'system',
      action: 'ADD_COMPLIANCE_LOG',
      details: {
        log_id: logId,
        category,
        zone,
        reading,
        threshold,
        status
      },
      store_id: storeId,
    });

    res.json({
      success: true,
      log_entry: {
        log_id: logEntry.log_id,
        category: logEntry.category,
        zone: logEntry.zone,
        reading: logEntry.reading,
        status: logEntry.status,
        logged_at: logEntry.logged_at,
      },
      message: 'Compliance log entry added successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add compliance log entry',
    });
  }
};

const getAuditStatus = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    let auditStatus = await AuditStatus.findOne({ store_id: storeId }).sort({ createdAt: -1 });

    if (!auditStatus) {
      auditStatus = new AuditStatus({
        status: 'compliant',
        last_passed: new Date(),
        next_audit: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        critical_checks_up_to_date: true,
        message: 'All critical compliance checks are up to date.',
        store_id: storeId,
      });
      await auditStatus.save();
    }

    res.json({
      success: true,
      audit_status: {
        status: auditStatus.status,
        last_passed: auditStatus.last_passed,
        next_audit: auditStatus.next_audit,
        critical_checks_up_to_date: auditStatus.critical_checks_up_to_date,
        message: auditStatus.message,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch audit status',
    });
  }
};

const getActionHistory = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const history = await AuditLog.find({ store_id: storeId, module: 'qc' }).sort({ timestamp: -1 }).limit(50);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getQCSummary,
  getQCInspections,
  createQCInspection,
  getTemperatureLogs,
  createTemperatureLog,
  getComplianceChecks,
  toggleComplianceCheck,
  getComplianceDocs,
  getSampleTests,
  createSampleTest,
  updateSampleResult,
  getRejections,
  createRejection,
  getQCFailures,
  getRecentFailures,
  resolveQCFailure,
  getWatchlist,
  addWatchlistItem,
  logQCCheck,
  getComplianceLogs,
  addComplianceLog,
  getAuditStatus,
  getActionHistory
};
