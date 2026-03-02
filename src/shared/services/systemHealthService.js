const DeviceHealth = require('../../common-models/DeviceHealth');
const DiagnosticsReport = require('../../common-models/DiagnosticsReport');
const logger = require('../../core/utils/logger');

/**
 * Get system health summary
 */
const getSystemHealthSummary = async () => {
  try {
    const totalDevices = await DeviceHealth.countDocuments();
    const activeDevices = await DeviceHealth.countDocuments({
      status: { $in: ['Healthy', 'Attention'] },
      lastSync: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Active in last 5 minutes
    });

    const connectivityIssues = await DeviceHealth.countDocuments({
      status: { $in: ['Attention', 'Critical', 'Offline'] },
    });

    // Calculate uptime (mock for now)
    const systemUptime = 99.98;

    return {
      systemUptime: systemUptime ?? 0,
      activeDevices: activeDevices ?? 0,
      totalDevices: totalDevices ?? 0,
      connectivityIssues: connectivityIssues ?? 0,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error getting system health summary:', error);
    throw error;
  }
};

/**
 * List device health logs
 */
const listDeviceHealth = async (filters = {}) => {
  try {
    const {
      status,
      riderId,
      search,
      page = 1,
      limit = 50,
    } = filters;

    const query = {};

    if (status) query.status = status;
    if (riderId) query.riderId = riderId;

    if (search) {
      query.$or = [
        { deviceId: { $regex: search, $options: 'i' } },
        { riderName: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const devices = await DeviceHealth.find(query)
      .sort({ lastSync: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await DeviceHealth.countDocuments(query);

    return {
      devices,
      total,
      page,
      limit,
    };
  } catch (error) {
    logger.error('Error listing device health:', error);
    throw error;
  }
};

/**
 * Get device health by ID
 */
const getDeviceHealthById = async (deviceId) => {
  try {
    const device = await DeviceHealth.findOne({ deviceId }).lean();
    if (!device) {
      throw new Error('Device not found');
    }
    return device;
  } catch (error) {
    logger.error('Error getting device health by ID:', error);
    throw error;
  }
};

/**
 * Run system diagnostics
 */
const runDiagnostics = async (options = {}) => {
  try {
    const {
      scope = 'full',
      deviceIds = [],
    } = options;

    const reportId = `diag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const report = new DiagnosticsReport({
      reportId,
      status: 'in_progress',
      scope,
      findings: [],
    });

    await report.save();

    // Perform diagnostics based on scope
    const findings = [];

    if (scope === 'full' || scope === 'devices') {
      const devices = deviceIds.length > 0
        ? await DeviceHealth.find({ deviceId: { $in: deviceIds } }).lean()
        : await DeviceHealth.find({}).lean();

      devices.forEach(device => {
        if (device.batteryLevel < 20) {
          findings.push({
            type: 'warning',
            severity: 'medium',
            message: `Device ${device.deviceId} has low battery (${device.batteryLevel}%)`,
            deviceId: device.deviceId,
            recommendation: 'Charge device or replace battery',
          });
        }

        if (!device.isLatestVersion) {
          findings.push({
            type: 'warning',
            severity: 'low',
            message: `Device ${device.deviceId} has outdated app version (${device.appVersion})`,
            deviceId: device.deviceId,
            recommendation: 'Update app to latest version',
          });
        }

        if (device.signalStrength === 'Weak' || device.signalStrength === 'None') {
          findings.push({
            type: 'error',
            severity: 'high',
            message: `Device ${device.deviceId} has weak or no signal`,
            deviceId: device.deviceId,
            recommendation: 'Check network connectivity',
          });
        }

        const lastSyncAge = Date.now() - new Date(device.lastSync).getTime();
        if (lastSyncAge > 15 * 60 * 1000) { // 15 minutes
          findings.push({
            type: 'error',
            severity: 'high',
            message: `Device ${device.deviceId} has not synced in ${Math.floor(lastSyncAge / 60000)} minutes`,
            deviceId: device.deviceId,
            recommendation: 'Check device connectivity and app status',
          });
        }
      });
    }

    // Calculate summary
    const summary = {
      totalChecks: findings.length,
      passed: findings.filter(f => f.type === 'info').length,
      failed: findings.filter(f => f.type === 'error').length,
      warnings: findings.filter(f => f.type === 'warning').length,
    };

    report.findings = findings;
    report.summary = summary;
    report.status = 'completed';
    report.completedAt = new Date();
    await report.save();

    return report.toObject();
  } catch (error) {
    logger.error('Error running diagnostics:', error);
    throw error;
  }
};

/**
 * Get diagnostics report
 */
const getDiagnosticsReport = async (reportId) => {
  try {
    const report = await DiagnosticsReport.findOne({ reportId }).lean();
    if (!report) {
      throw new Error('Diagnostics report not found');
    }
    return report;
  } catch (error) {
    logger.error('Error getting diagnostics report:', error);
    throw error;
  }
};

module.exports = {
  getSystemHealthSummary,
  listDeviceHealth,
  getDeviceHealthById,
  runDiagnostics,
  getDiagnosticsReport,
};

