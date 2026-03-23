const SystemService = require('../models/SystemService');
const SystemLog = require('../models/SystemLog');
const logger = require('../../core/utils/logger');
const asyncHandler = require('../../middleware/asyncHandler');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');

/**
 * Get all system services
 */
const getServices = asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;

  const services = await SystemService.find(mergeHubFilter(filter))
    .sort({ name: 1 })
    .lean();

  res.json({
    success: true,
    data: services.map(service => ({
      ...service,
      id: service._id.toString(),
    })),
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get service by ID
 */
const getServiceById = asyncHandler(async (req, res) => {
  const service = await SystemService.findOne(mergeHubFilter({ _id: req.params.id })).lean();
  
  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  res.json({
    success: true,
    data: {
      ...service,
      id: service._id.toString(),
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Create or update service
 */
const upsertService = asyncHandler(async (req, res) => {
  const { name, type, status, endpoint, responseTime, uptime } = req.body;
  
  const service = await SystemService.findOneAndUpdate(
    mergeHubFilter({ name }),
    {
      $set: {
        name,
        type,
        status,
        endpoint,
        responseTime,
        uptime,
        lastChecked: new Date(),
      },
      $setOnInsert: hubFieldsForCreate(),
    },
    { upsert: true, new: true }
  );

  res.json({
    success: true,
    data: {
      ...service.toObject(),
      id: service._id.toString(),
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get system logs
 */
const getLogs = asyncHandler(async (req, res) => {
  const { serviceName, level, startDate, endDate, limit = 100 } = req.query;
  
  const filter = {};
  if (serviceName) filter.serviceName = serviceName;
  if (level) filter.level = level;
  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }

  const logs = await SystemLog.find(mergeHubFilter(filter))
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

  res.json({
    success: true,
    data: logs.map(log => ({
      ...log,
      id: log._id.toString(),
      time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: true }) : '',
      date: log.timestamp ? new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
    })),
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Create log entry
 */
const createLog = asyncHandler(async (req, res) => {
  const log = new SystemLog({ ...req.body, ...hubFieldsForCreate() });
  await log.save();

  res.status(201).json({
    success: true,
    data: {
      ...log.toObject(),
      id: log._id.toString(),
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  getServices,
  getServiceById,
  upsertService,
  getLogs,
  createLog,
};
