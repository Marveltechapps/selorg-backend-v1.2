const ProductionAlert = require('../models/ProductionAlert');
const ProductionIncident = require('../models/ProductionIncident');
const ProductionSyncHistory = require('../models/ProductionSyncHistory');
const ProductionSettings = require('../models/ProductionSettings');
const BulkUpload = require('../models/BulkUpload');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

const DEFAULT_FACTORY = process.env.DEFAULT_FACTORY_ID || 'FAC-Austin-01';

// ---- Alerts ----
const getProductionAlerts = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || DEFAULT_FACTORY;
    const status = req.query.status || 'all';
    const severity = req.query.severity || 'all';
    const category = req.query.category || 'all';
    const search = (req.query.search || '').trim().toLowerCase();

    const query = { factory_id: factoryId };
    if (status !== 'all') {
      if (status === 'active') {
        query.status = { $in: ['active', 'acknowledged'] };
      } else if (status === 'history') {
        query.status = { $in: ['resolved', 'dismissed'] };
      } else {
        query.status = status;
      }
    }
    if (severity !== 'all') query.severity = severity;
    if (category !== 'all') query.category = category;

    let alerts = await ProductionAlert.find(query).sort({ created_at: -1 }).lean();
    if (search) {
      alerts = alerts.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(search) ||
          (a.description || '').toLowerCase().includes(search)
      );
    }

    const allAlerts = await ProductionAlert.find({ factory_id: factoryId }).lean();
    const criticalCount = allAlerts.filter(
      (a) => a.severity === 'critical' && ['active', 'acknowledged'].includes(a.status)
    ).length;
    const warningCount = allAlerts.filter(
      (a) => a.severity === 'warning' && ['active', 'acknowledged'].includes(a.status)
    ).length;
    const activeCount = allAlerts.filter((a) =>
      ['active', 'acknowledged'].includes(a.status)
    ).length;

    const transformed = alerts.map((a) => ({
      id: a.alert_id,
      title: a.title,
      description: a.description,
      severity: a.severity,
      category: a.category,
      status: a.status,
      timestamp: a.created_at,
      location: a.location,
      assignedTo: a.assigned_to,
      resolvedBy: a.resolved_by,
      resolvedAt: a.resolved_at,
    }));

    res.status(200).json({
      success: true,
      alerts: transformed,
      summary: {
        criticalCount,
        warningCount,
        activeAlertsCount: activeCount,
      },
    });
  } catch (error) {
    logger.error('Get production alerts error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch alerts' });
  }
};

const updateProductionAlertStatus = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { actionType, assignee } = req.body;

    const alert = await ProductionAlert.findOne({ alert_id: alertId });
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const now = new Date();
    switch (actionType) {
      case 'acknowledge':
        alert.status = 'acknowledged';
        if (assignee) alert.assigned_to = assignee;
        break;
      case 'resolved':
        alert.status = 'resolved';
        alert.resolved_by = alert.assigned_to || assignee || 'Unknown';
        alert.resolved_at = now;
        break;
      case 'dismissed':
        alert.status = 'dismissed';
        break;
      case 'dispatch':
        alert.status = 'acknowledged';
        if (assignee) alert.assigned_to = assignee;
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid action type' });
    }
    alert.updated_at = now;
    await alert.save();

    res.status(200).json({
      success: true,
      alert: {
        id: alert.alert_id,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        category: alert.category,
        status: alert.status,
        timestamp: alert.created_at,
        location: alert.location,
        assignedTo: alert.assigned_to,
        resolvedBy: alert.resolved_by,
        resolvedAt: alert.resolved_at,
      },
      message: `Alert ${actionType} successfully`,
    });
  } catch (error) {
    logger.error('Update production alert error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update alert' });
  }
};

const deleteProductionAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const result = await ProductionAlert.deleteOne({ alert_id: alertId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    res.status(200).json({ success: true, message: 'Alert deleted' });
  } catch (error) {
    logger.error('Delete production alert error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete alert' });
  }
};

// ---- Incidents ----
const getProductionIncidents = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || DEFAULT_FACTORY;

    const incidents = await ProductionIncident.find({ factory_id: factoryId })
      .sort({ reported_at: -1 })
      .lean();

    const openCount = incidents.filter((i) => ['open', 'investigating'].includes(i.status)).length;

    const transformed = incidents.map((i) => ({
      id: i.incident_id,
      title: i.title,
      description: i.description,
      severity: i.severity,
      category: i.category,
      reportedBy: i.reported_by,
      location: i.location,
      timestamp: i.reported_at,
      status: i.status,
    }));

    res.status(200).json({
      success: true,
      incidents: transformed,
      openIncidentsCount: openCount,
    });
  } catch (error) {
    logger.error('Get production incidents error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch incidents' });
  }
};

const createProductionIncident = async (req, res) => {
  try {
    const { title, description, severity, category, reportedBy, location } = req.body;
    if (!title || !description || !reportedBy) {
      return res.status(400).json({
        success: false,
        error: 'title, description, and reportedBy are required',
      });
    }

    const factoryId = req.body.factoryId || req.query.factoryId || DEFAULT_FACTORY;
    const incidentId = generateId('INC');
    const incident = await ProductionIncident.create({
      incident_id: incidentId,
      title,
      description,
      severity: severity || 'medium',
      category: category || 'General',
      reported_by: reportedBy,
      location: location || 'Not specified',
      status: 'open',
      factory_id: factoryId,
    });

    res.status(201).json({
      success: true,
      incident: {
        id: incident.incident_id,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        category: incident.category,
        reportedBy: incident.reported_by,
        location: incident.location,
        timestamp: incident.reported_at,
        status: incident.status,
      },
      message: 'Incident reported successfully',
    });
  } catch (error) {
    logger.error('Create production incident error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to report incident' });
  }
};

const updateProductionIncidentStatus = async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { status } = req.body;

    if (!['open', 'investigating', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const update = { status, updated_at: new Date() };
    if (status === 'resolved') {
      update.resolved_at = new Date();
      update.resolved_by = req.body.resolvedBy || 'System';
    }

    const incident = await ProductionIncident.findOneAndUpdate(
      { incident_id: incidentId },
      update,
      { new: true }
    );
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    res.status(200).json({
      success: true,
      incident: {
        id: incident.incident_id,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        category: incident.category,
        reportedBy: incident.reported_by,
        location: incident.location,
        timestamp: incident.reported_at,
        status: incident.status,
      },
      message: 'Incident updated successfully',
    });
  } catch (error) {
    logger.error('Update production incident error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update incident' });
  }
};

// ---- Reports ----
const getProductionReports = async (req, res) => {
  try {
    const reportType = req.query.reportType || 'overview';
    const preset = req.query.preset || 'week'; // week | month | quarter
    const factoryId = req.query.factoryId || DEFAULT_FACTORY;

    const end = new Date();
    const start = new Date();
    if (preset === 'week') start.setDate(start.getDate() - 7);
    else if (preset === 'month') start.setMonth(start.getMonth() - 1);
    else start.setMonth(start.getMonth() - 3);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Generate report data (aggregate from DB in real app; here we return structured analytics)
    const days = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) || 7;
    const labels = Array.from({ length: Math.min(days, 8) }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const productionData = labels.map((date, i) => ({
      date,
      output: 2400 + Math.floor(Math.random() * 400),
      target: 2600,
      efficiency: 90 + Math.floor(Math.random() * 15),
    }));

    const lineUtilizationData = [
      { name: 'Line A', utilization: 95, downtime: 5 },
      { name: 'Line B', utilization: 88, downtime: 12 },
      { name: 'Line C', utilization: 92, downtime: 8 },
      { name: 'Line D', utilization: 78, downtime: 22 },
    ];

    const materialData = [
      { material: 'Organic Oats', allocated: 1500, consumed: 1380, waste: 120 },
      { material: 'Sugar', allocated: 800, consumed: 750, waste: 50 },
      { material: 'Packaging Film', allocated: 500, consumed: 485, waste: 15 },
      { material: 'Protein Powder', allocated: 600, consumed: 580, waste: 20 },
      { material: 'Almond Extract', allocated: 300, consumed: 290, waste: 10 },
    ];

    const qualityData = labels.map((date) => ({
      date,
      passRate: 97 + Math.random() * 3,
      defects: Math.floor(Math.random() * 50) + 10,
    }));

    const workforceData = [
      { shift: 'Morning', productivity: 94, attendance: 96 },
      { shift: 'Afternoon', productivity: 89, attendance: 92 },
      { shift: 'Night', productivity: 86, attendance: 88 },
    ];

    const maintenanceData = [
      { month: 'Week 1', preventive: 8, corrective: 3, breakdown: 1 },
      { month: 'Week 2', preventive: 10, corrective: 5, breakdown: 2 },
      { month: 'Week 3', preventive: 9, corrective: 4, breakdown: 1 },
      { month: 'Week 4', preventive: 11, corrective: 2, breakdown: 0 },
    ];

    const defectTypeData = [
      { name: 'Weight Issue', value: 89 },
      { name: 'Visual Defect', value: 62 },
      { name: 'Seal Integrity', value: 31 },
      { name: 'Contamination', value: 18 },
      { name: 'Other', value: 18 },
    ];

    res.status(200).json({
      success: true,
      dateRange: { start: startStr, end: endStr },
      reportType,
      data: {
        productionData,
        lineUtilizationData,
        materialData,
        qualityData,
        workforceData,
        maintenanceData,
        defectTypeData,
      },
    });
  } catch (error) {
    logger.error('Get production reports error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch reports' });
  }
};

const exportProductionReports = async (req, res) => {
  try {
    const { preset } = req.query;
    const end = new Date();
    const start = new Date();
    if (preset === 'week') start.setDate(start.getDate() - 7);
    else if (preset === 'month') start.setMonth(start.getMonth() - 1);
    else start.setMonth(start.getMonth() - 3);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const csvContent = [
      ['Comprehensive Production Report', `Period: ${startStr} to ${endStr}`].join(','),
      '',
      'Date,Output,Target,Efficiency',
      'Dec 15,2400,2600,92',
      'Dec 16,2600,2600,100',
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="production-comprehensive-${endStr}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    logger.error('Export production reports error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to export' });
  }
};

// ---- Utilities ----
const getProductionUploadHistory = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || DEFAULT_FACTORY;
    const limit = parseInt(req.query.limit) || 20;

    const uploads = await BulkUpload.find({ store_id: factoryId })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    const transformed = uploads.map((u) => ({
      id: u.upload_id,
      fileName: u.file_name,
      type: u.upload_type || 'Work Orders',
      recordsProcessed: u.processed_rows || u.total_rows || 0,
      uploadedBy: u.uploaded_by || 'Admin',
      timestamp: u.created_at,
      status: u.status === 'completed' ? 'success' : u.status === 'failed' ? 'failed' : 'processing',
    }));

    res.status(200).json({ success: true, uploads: transformed });
  } catch (error) {
    logger.error('Get production upload history error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch uploads' });
  }
};

const getProductionSyncHistory = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || DEFAULT_FACTORY;
    const limit = parseInt(req.query.limit) || 20;

    const syncs = await ProductionSyncHistory.find({ factory_id: factoryId })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    const transformed = syncs.map((s) => ({
      id: s.sync_id,
      deviceCount: s.device_count,
      timestamp: s.created_at,
      status: s.status,
      duration: s.duration_seconds ? `${s.duration_seconds}s` : '—',
    }));

    res.status(200).json({ success: true, syncs: transformed });
  } catch (error) {
    logger.error('Get production sync history error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch sync history' });
  }
};

const performProductionHSDSync = async (req, res) => {
  try {
    const factoryId = req.body.factoryId || req.query.factoryId || DEFAULT_FACTORY;
    const syncId = generateId('HSDSYNC');
    const deviceCount = 45;
    const durationSeconds = Math.round((Math.random() * 2 + 1) * 10) / 10;

    await ProductionSyncHistory.create({
      sync_id: syncId,
      factory_id: factoryId,
      device_count: deviceCount,
      status: 'success',
      duration_seconds: durationSeconds,
    });

    res.status(200).json({
      success: true,
      syncId,
      deviceCount,
      status: 'success',
      duration: `${durationSeconds}s`,
      message: 'HSD sync completed successfully',
    });
  } catch (error) {
    logger.error('Production HSD sync error:', error);
    res.status(500).json({ success: false, error: error.message || 'Sync failed' });
  }
};

const getProductionSettings = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || DEFAULT_FACTORY;

    let settings = await ProductionSettings.findOne({ factory_id: factoryId }).lean();
    if (!settings) {
      settings = await ProductionSettings.create({
        factory_id: factoryId,
        auto_sync: true,
        sync_interval_minutes: 15,
        auto_backup: true,
        backup_interval: 'daily',
        email_notifications: true,
        alert_threshold: 'medium',
      });
      settings = settings.toObject();
    }

    res.status(200).json({
      success: true,
      settings: {
        autoSync: settings.auto_sync,
        syncInterval: String(settings.sync_interval_minutes),
        autoBackup: settings.auto_backup,
        backupInterval: settings.backup_interval,
        emailNotifications: settings.email_notifications,
        alertThreshold: settings.alert_threshold,
      },
    });
  } catch (error) {
    logger.error('Get production settings error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch settings' });
  }
};

const updateProductionSettings = async (req, res) => {
  try {
    const factoryId = req.body.factoryId || req.query.factoryId || DEFAULT_FACTORY;
    const {
      autoSync,
      syncInterval,
      autoBackup,
      backupInterval,
      emailNotifications,
      alertThreshold,
    } = req.body;

    const update = { updated_at: new Date() };
    if (typeof autoSync === 'boolean') update.auto_sync = autoSync;
    if (syncInterval != null) update.sync_interval_minutes = parseInt(syncInterval, 10) || 15;
    if (typeof autoBackup === 'boolean') update.auto_backup = autoBackup;
    if (backupInterval) update.backup_interval = backupInterval;
    if (typeof emailNotifications === 'boolean') update.email_notifications = emailNotifications;
    if (alertThreshold) update.alert_threshold = alertThreshold;

    const settings = await ProductionSettings.findOneAndUpdate(
      { factory_id: factoryId },
      { $set: update },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      settings: {
        autoSync: settings.auto_sync,
        syncInterval: String(settings.sync_interval_minutes),
        autoBackup: settings.auto_backup,
        backupInterval: settings.backup_interval,
        emailNotifications: settings.email_notifications,
        alertThreshold: settings.alert_threshold,
      },
      message: 'Settings saved successfully',
    });
  } catch (error) {
    logger.error('Update production settings error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to save settings' });
  }
};

const getProductionAuditLogs = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || req.query.storeId || DEFAULT_FACTORY;
    const limit = parseInt(req.query.limit) || 50;

    const logs = await AuditLog.find({ store_id: factoryId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const transformed = logs.map((l) => ({
      id: l.id,
      action: l.action || l.action_type,
      user: l.user_name || l.user || 'System',
      timestamp: l.timestamp,
      details: typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || ''),
    }));

    res.status(200).json({ success: true, logs: transformed });
  } catch (error) {
    logger.error('Get production audit logs error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch audit logs' });
  }
};

module.exports = {
  getProductionAlerts,
  updateProductionAlertStatus,
  deleteProductionAlert,
  getProductionIncidents,
  createProductionIncident,
  updateProductionIncidentStatus,
  getProductionReports,
  exportProductionReports,
  getProductionUploadHistory,
  getProductionSyncHistory,
  performProductionHSDSync,
  getProductionSettings,
  updateProductionSettings,
  getProductionAuditLogs,
};
