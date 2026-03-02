const Device = require('../models/Device');
const HSDSession = require('../models/HSDSession');
const HSDDeviceAction = require('../models/HSDDeviceAction');
const HSDDeviceIssue = require('../models/HSDDeviceIssue');
const DeviceHistory = require('../models/DeviceHistory');
const AuditLog = require('../models/AuditLog');
const OutboundTransferRequest = require('../models/OutboundTransferRequest');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/**
 * Get Fleet Overview
 * GET /api/darkstore/hsd/fleet
 */
const getFleetOverview = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';

    // Build query
    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }

    // Get all devices
    const devices = await Device.find(query).lean();

    // Calculate summary
    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const offlineDevices = devices.filter(d => d.status === 'offline').length;
    const chargingDevices = devices.filter(d => d.status === 'charging').length;
    const errorDevices = devices.filter(d => d.status === 'error').length;
    const lowBatteryCount = devices.filter(d => d.battery_level < 20).length;

    // Calculate average sync latency (mock)
    const avgSyncLatency = 120;

    // Transform devices to match YAML format
    const transformedDevices = devices.map(device => ({
      deviceId: device.device_id,
      assignedTo: device.assigned_to ? {
        userId: device.assigned_to.userId,
        userName: device.assigned_to.userName,
        userType: device.assigned_to.userType,
      } : null,
      status: device.status,
      battery: device.battery_level || 0,
      signal: device.signal_strength || 'no_signal',
      lastSync: device.last_sync || device.last_seen?.toISOString() || new Date().toISOString(),
      deviceType: device.device_type || 'Scanner',
      firmwareVersion: device.firmware_version || '1.0.0',
    }));

    res.status(200).json({
      success: true,
      summary: {
        totalDevices: totalDevices,
        onlineDevices: onlineDevices,
        offlineDevices: offlineDevices,
        chargingDevices: chargingDevices,
        errorDevices: errorDevices,
        lowBatteryCount: lowBatteryCount,
        avgSyncLatency: avgSyncLatency,
      },
      devices: transformedDevices,
    });
  } catch (error) {
    logger.error('Get fleet overview error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch fleet overview',
    });
  }
};

/**
 * Register New Device
 * POST /api/darkstore/hsd/devices/register
 */
const registerDevice = async (req, res) => {
  try {
    const { deviceId, deviceType, serialNumber, firmwareVersion, storeId } = req.body;

    if (!deviceId || !deviceType || !serialNumber || !storeId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId, deviceType, serialNumber, and storeId are required',
      });
    }

    // Check if device already exists
    const existingDevice = await Device.findOne({ device_id: deviceId });
    if (existingDevice) {
      return res.status(400).json({
        success: false,
        error: 'Device already registered',
      });
    }

    const now = new Date().toISOString();

    const device = await Device.create({
      device_id: deviceId,
      device_type: deviceType,
      serial_number: serialNumber,
      firmware_version: firmwareVersion,
      status: 'offline',
      store_id: storeId,
    });

    res.status(200).json({
      success: true,
      device: {
        deviceId: device.device_id,
        status: device.status,
        registeredAt: now,
      },
      message: 'Device registered successfully',
    });
  } catch (error) {
    logger.error('Register device error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register device',
    });
  }
};

/**
 * Assign Device to User
 * POST /api/darkstore/hsd/devices/:deviceId/assign
 */
const assignDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { userId, userName, userType } = req.body;

    if (!userId || !userName || !userType) {
      return res.status(400).json({
        success: false,
        error: 'userId, userName, and userType are required',
      });
    }

    const device = await Device.findOne({ device_id: deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    // Save previous state for history
    const previousState = device.assigned_to ? {
      userId: device.assigned_to.userId,
      userName: device.assigned_to.userName,
      userType: device.assigned_to.userType,
    } : null;

    device.assigned_to = {
      userId: userId,
      userName: userName,
      userType: userType,
    };

    await device.save();

    // Log history
    await DeviceHistory.create({
      device_id: deviceId,
      store_id: device.store_id,
      action: 'ASSIGN',
      performed_by: req.body.performedBy || 'system',
      metadata: {
        userId,
        userName,
        userType,
      },
      previous_state: previousState,
      new_state: {
        userId: device.assigned_to.userId,
        userName: device.assigned_to.userName,
        userType: device.assigned_to.userType,
      },
    });

    res.status(200).json({
      success: true,
      device: {
        deviceId: device.device_id,
        assignedTo: {
          userId: device.assigned_to.userId,
          userName: device.assigned_to.userName,
          userType: device.assigned_to.userType,
        },
        assignedAt: new Date().toISOString(),
      },
      message: 'Device assigned successfully',
    });
  } catch (error) {
    logger.error('Assign device error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign device',
    });
  }
};

/**
 * Unassign Device
 * POST /api/darkstore/hsd/devices/:deviceId/unassign
 */
const unassignDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOne({ device_id: deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    // Save previous state for history
    const previousState = device.assigned_to ? {
      userId: device.assigned_to.userId,
      userName: device.assigned_to.userName,
      userType: device.assigned_to.userType,
    } : null;

    device.assigned_to = null;
    await device.save();

    // Log history
    await DeviceHistory.create({
      device_id: deviceId,
      store_id: device.store_id,
      action: 'UNASSIGN',
      performed_by: req.body.performedBy || 'system',
      metadata: {
        reason: req.body.reason || 'Manual unassign',
      },
      previous_state: previousState,
      new_state: null,
    });

    res.status(200).json({
      success: true,
      device: {
        deviceId: device.device_id,
        assignedTo: null,
        unassignedAt: new Date().toISOString(),
      },
      message: 'Device unassigned successfully',
    });
  } catch (error) {
    logger.error('Unassign device error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unassign device',
    });
  }
};

/**
 * Get Live Sessions
 * GET /api/darkstore/hsd/sessions/live
 */
const getLiveSessions = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const deviceId = req.query.deviceId;

    const query = { store_id: storeId };
    if (deviceId) {
      query.device_id = deviceId;
    }

    const sessions = await HSDSession.find(query)
      .sort({ last_activity: -1 })
      .lean();

    const transformedSessions = sessions.map(session => ({
      deviceId: session.device_id,
      userId: session.user_id,
      userName: session.user_name,
      taskType: session.task_type,
      taskId: session.task_id,
      currentStatus: session.current_status,
      zone: session.zone,
      startedAt: session.started_at,
      lastActivity: session.last_activity,
      itemsCompleted: session.items_completed || 0,
      itemsTotal: session.items_total || 0,
    }));

    res.status(200).json({
      success: true,
      sessions: transformedSessions,
    });
  } catch (error) {
    logger.error('Get live sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch live sessions',
    });
  }
};

/**
 * Get Device Actions Log
 * GET /api/darkstore/hsd/devices/:deviceId/actions
 */
const getDeviceActions = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const actions = await HSDDeviceAction.find({ device_id: deviceId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const transformedActions = actions.map(action => ({
      timestamp: action.timestamp,
      actionType: action.event_type,
      details: action.details,
      result: action.result,
    }));

    res.status(200).json({
      success: true,
      actions: transformedActions,
    });
  } catch (error) {
    logger.error('Get device actions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch device actions',
    });
  }
};

/**
 * Device Control Actions
 * POST /api/darkstore/hsd/devices/:deviceId/control
 */
const deviceControl = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { action, reason } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required',
      });
    }

    // Handle system-wide actions or specific device actions
    if (deviceId === 'SYSTEM' || deviceId.startsWith('HSD-')) {
      // Log to DeviceHistory for system actions
      await DeviceHistory.create({
        device_id: deviceId,
        store_id: req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04',
        action: action.toUpperCase(),
        performed_by: req.body.performedBy || 'system',
        metadata: {
          reason: reason || 'System control',
          timestamp: new Date().toISOString()
        },
        previous_state: { status: 'N/A' },
        new_state: { status: 'N/A' }
      });

      // Also log to HSDDeviceAction for the activity log
      await HSDDeviceAction.create({
        action_id: generateId('ACTION'),
        device_id: deviceId,
        store_id: req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04',
        event_type: 'system_control',
        details: `${action.replace('_', ' ').toUpperCase()} initiated remotely for ${deviceId}`,
        result: 'success',
        timestamp: new Date().toISOString(),
        performed_by: req.body.performedBy || 'system'
      });

      return res.status(200).json({
        success: true,
        action: action,
        status: 'initiated',
        message: `System action ${action} processed for ${deviceId}`,
      });
    }

    const device = await Device.findOne({ device_id: deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    if (device.status === 'offline') {
      return res.status(400).json({
        success: false,
        error: 'Device is offline and cannot be controlled',
      });
    }

    // In production, this would send command to device
    // For now, just update device status or log action

    const now = new Date().toISOString();
    let message = `Device ${action} command sent`;
    
    // Log to DeviceHistory
    await DeviceHistory.create({
      device_id: deviceId,
      store_id: device.store_id,
      action: action.toUpperCase(),
      performed_by: req.body.performedBy || 'system',
      metadata: {
        reason: reason || 'Remote control',
        timestamp: now
      },
      previous_state: { status: device.status },
      new_state: { status: device.status } // Status might not change immediately
    });

    // Also log to HSDDeviceAction for the activity log
    await HSDDeviceAction.create({
      action_id: generateId('ACTION'),
      device_id: deviceId,
      store_id: device.store_id,
      event_type: 'system',
      details: `${action.replace('_', ' ').toUpperCase()} initiated remotely`,
      result: 'success',
      timestamp: now,
      performed_by: req.body.performedBy || 'system'
    });

    res.status(200).json({
      success: true,
      action: action,
      status: 'initiated',
      message: message,
    });
  } catch (error) {
    logger.error('Device control error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to control device',
    });
  }
};

/**
 * Get Issue Tracker
 * GET /api/darkstore/hsd/issues
 */
const getIssues = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const deviceId = req.query.deviceId;

    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }
    if (deviceId) {
      query.device_id = deviceId;
    }

    const issues = await HSDDeviceIssue.find(query)
      .sort({ reported_at: -1 })
      .lean();

    const transformedIssues = issues.map(issue => ({
      ticketId: issue.ticket_id,
      deviceId: issue.device_id,
      issueType: issue.issue_type,
      description: issue.description,
      status: issue.status,
      reportedAt: issue.reported_at,
      reportedBy: issue.reported_by,
      priority: issue.priority,
    }));

    res.status(200).json({
      success: true,
      issues: transformedIssues,
    });
  } catch (error) {
    logger.error('Get issues error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch issues',
    });
  }
};

/**
 * Report Device Issue
 * POST /api/darkstore/hsd/issues/report
 */
const reportIssue = async (req, res) => {
  try {
    const { deviceId, issueType, description, priority, reportedBy } = req.body;

    if (!deviceId || !issueType || !description) {
      return res.status(400).json({
        success: false,
        error: 'deviceId, issueType, and description are required',
      });
    }

    const ticketId = generateId('T');
    const now = new Date().toISOString();
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

    await HSDDeviceIssue.create({
      ticket_id: ticketId,
      device_id: deviceId,
      issue_type: issueType,
      description: description,
      status: 'open',
      priority: priority || 'medium',
      reported_by: reportedBy,
      reported_at: now,
      store_id: storeId,
    });

    res.status(200).json({
      success: true,
      ticketId: ticketId,
      message: 'Issue reported successfully',
    });
  } catch (error) {
    logger.error('Report issue error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to report issue',
    });
  }
};

/**
 * Get HSD Logs
 * GET /api/darkstore/hsd/logs
 */
const getHSDLogs = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const deviceId = req.query.deviceId;
    const eventType = req.query.eventType || 'all';
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (deviceId) {
      query.device_id = deviceId;
    }
    if (eventType !== 'all') {
      query.event_type = eventType;
    }

    const totalItems = await HSDDeviceAction.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    let logs = await HSDDeviceAction.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => 
        log.details.toLowerCase().includes(searchLower)
      );
    }

    const transformedLogs = logs.map(log => ({
      timestamp: log.timestamp,
      deviceId: log.device_id,
      userId: log.user_id,
      userName: log.user_name,
      eventType: log.event_type,
      details: log.details,
      result: log.result,
    }));

    res.status(200).json({
      success: true,
      logs: transformedLogs,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get HSD logs error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch HSD logs',
    });
  }
};

/**
 * Bulk Reset Selected Devices
 * POST /api/darkstore/hsd/devices/bulk-reset
 */
const bulkResetDevices = async (req, res) => {
  try {
    const { deviceIds } = req.body;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds array is required',
      });
    }

    const storeId = req.body.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const results = [];
    const errors = [];

    for (const deviceId of deviceIds) {
      try {
        const device = await Device.findOne({ device_id: deviceId, store_id: storeId });
        if (!device) {
          errors.push({ deviceId, error: 'Device not found' });
          continue;
        }

        // Save previous state for history
        const previousState = device.assigned_to ? {
          userId: device.assigned_to.userId,
          userName: device.assigned_to.userName,
          userType: device.assigned_to.userType,
        } : null;

        device.assigned_to = null;
        await device.save();

        // Log history
        await DeviceHistory.create({
          device_id: deviceId,
          store_id: storeId,
          action: 'RESET',
          performed_by: req.body.performedBy || 'system',
          metadata: {
            reason: req.body.reason || 'Bulk reset',
          },
          previous_state: previousState,
          new_state: null,
        });

        results.push({
          deviceId,
          success: true,
          assignedTo: null,
        });
      } catch (error) {
        errors.push({ deviceId, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: `${results.length} device(s) reset successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
    });
  } catch (error) {
    logger.error('Bulk reset devices error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reset devices',
    });
  }
};

/**
 * Get Device History
 * GET /api/darkstore/hsd/devices/:deviceId/history
 */
const getDeviceHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const history = await DeviceHistory.find({ device_id: deviceId })
      .sort({ performed_at: -1 })
      .limit(limit)
      .lean();

    const transformedHistory = history.map(item => ({
      id: item._id.toString(),
      action: item.action,
      performed_by: item.performed_by,
      performed_at: item.performed_at,
      metadata: item.metadata,
      previous_state: item.previous_state,
      new_state: item.new_state,
    }));

    res.status(200).json({
      success: true,
      history: transformedHistory,
    });
  } catch (error) {
    logger.error('Get device history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch device history',
    });
  }
};

/**
 * Perform Session Action (Simulator)
 * POST /api/darkstore/hsd/sessions/:deviceId/action
 */
const sessionAction = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { action, payload } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required',
      });
    }

    const session = await HSDSession.findOne({ device_id: deviceId });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Active session not found for this device',
      });
    }

    const now = new Date().toISOString();
    let details = '';
    let result = 'success';

    if (action === 'confirm_quantity') {
      const quantity = payload?.quantity || 1;
      session.items_completed = (session.items_completed || 0) + quantity;
      session.last_activity = now;
      session.current_status = 'Item Confirmed';
      await session.save();
      details = `Confirmed quantity: ${quantity} for ${session.task_id}`;
    } else if (action === 'report_issue') {
      session.current_status = 'Issue Reported';
      session.last_activity = now;
      await session.save();
      details = `Issue reported: ${payload?.reason || 'General issue'}`;
      result = 'warning';
    }

    // Log action
    await HSDDeviceAction.create({
      action_id: generateId('ACTION'),
      device_id: deviceId,
      store_id: session.store_id,
      user_id: session.user_id,
      user_name: session.user_name,
      event_type: action === 'confirm_quantity' ? 'scan_sku' : 'error',
      details: details,
      result: result,
      timestamp: now,
    });

    res.status(200).json({
      success: true,
      session: {
        deviceId: session.device_id,
        itemsCompleted: session.items_completed,
        itemsTotal: session.items_total,
        currentStatus: session.current_status,
      },
      message: 'Action processed successfully',
    });
  } catch (error) {
    logger.error('Session action error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process session action',
    });
  }
};

/**
 * Create Requisition Order
 * POST /api/darkstore/hsd/requisitions
 */
const createRequisition = async (req, res) => {
  try {
    const { deviceIds, reason, priority } = req.body;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds array is required',
      });
    }

    const requestId = generateId('REQ');
    const now = new Date().toISOString();

    // Mapping priority to match OutboundTransferRequest model
    const priorityMap = {
      'low': 'Normal',
      'medium': 'Normal',
      'high': 'High',
      'critical': 'Critical'
    };

    // In a real app, this would create a Requisition model entry
    // Here we'll use OutboundTransferRequest as a proxy
    await OutboundTransferRequest.create({
      request_id: requestId,
      from_store: 'HQ-Warehouse',
      to_store: storeId,
      status: 'pending',
      items_count: deviceIds.length,
      priority: priorityMap[priority] || 'Normal',
      requested_at: now,
      created_at: now,
      updated_at: now,
      notes: `Requisition for replacement devices: ${deviceIds.join(', ')}. Reason: ${reason}`,
    });

    // Create Audit Log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'update',
      module: 'hsd',
      user: req.body.performedBy || 'system',
      action: 'CREATE_REQUISITION',
      details: {
        request_id: requestId,
        device_ids: deviceIds,
        reason: reason,
      },
      store_id: storeId,
    });

    res.status(200).json({
      success: true,
      requestId: requestId,
      message: 'Requisition order created successfully',
    });
  } catch (error) {
    logger.error('Create requisition error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create requisition order',
    });
  }
};

module.exports = {
  getFleetOverview,
  registerDevice,
  assignDevice,
  unassignDevice,
  bulkResetDevices,
  getDeviceHistory,
  getLiveSessions,
  getDeviceActions,
  deviceControl,
  getIssues,
  reportIssue,
  getHSDLogs,
  sessionAction,
  createRequisition,
};

