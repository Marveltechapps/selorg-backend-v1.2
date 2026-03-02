const RiderHR = require('../models/RiderHR');
const logger = require('../../core/utils/logger');

const listRiderAccess = async (filters = {}, pagination = {}) => {
  try {
    const { appAccess, deviceAssigned, riderId, page = 1, limit = 50 } = { ...filters, ...pagination };

    const query = {};

    if (appAccess) {
      query.appAccess = appAccess;
    }

    if (deviceAssigned !== undefined) {
      query.deviceAssigned = deviceAssigned;
    }

    if (riderId) {
      query.id = riderId;
    }

    const skip = (page - 1) * limit;
    const total = await RiderHR.countDocuments(query);

    const riders = await RiderHR.find(query)
      .select('id name phone appAccess deviceAssigned deviceId deviceType')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format as RiderAccess
    const formattedRiders = riders.map(r => ({
      riderId: r.id,
      riderName: r.name,
      phone: r.phone,
      appAccess: r.appAccess,
      deviceAssigned: r.deviceAssigned,
      deviceId: r.deviceId || null,
      deviceType: r.deviceType || null,
    }));

    return {
      riders: formattedRiders,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Error listing rider access:', error);
    throw error;
  }
};

const updateRiderAccess = async (riderId, accessData) => {
  try {
    const { appAccess } = accessData;

    if (!['enabled', 'disabled'].includes(appAccess)) {
      const error = new Error('Invalid app access status');
      error.statusCode = 400;
      throw error;
    }

    const rider = await RiderHR.findOne({ id: riderId });

    if (!rider) {
      const error = new Error('Rider not found');
      error.statusCode = 404;
      throw error;
    }

    rider.appAccess = appAccess;
    await rider.save();

    return {
      riderId: rider.id,
      riderName: rider.name,
      phone: rider.phone,
      appAccess: rider.appAccess,
      deviceAssigned: rider.deviceAssigned,
      deviceId: rider.deviceId || null,
      deviceType: rider.deviceType || null,
    };
  } catch (error) {
    logger.error('Error updating rider access:', error);
    throw error;
  }
};

const assignDevice = async (riderId, deviceData) => {
  try {
    const { deviceId, deviceType } = deviceData;

    if (!deviceId) {
      const error = new Error('Device ID is required');
      error.statusCode = 400;
      throw error;
    }

    const rider = await RiderHR.findOne({ id: riderId });

    if (!rider) {
      const error = new Error('Rider not found');
      error.statusCode = 404;
      throw error;
    }

    rider.deviceAssigned = true;
    rider.deviceId = deviceId;
    rider.deviceType = deviceType || 'smartphone';

    await rider.save();

    return {
      riderId: rider.id,
      deviceId: rider.deviceId,
      deviceStatus: 'assigned',
    };
  } catch (error) {
    logger.error('Error assigning device:', error);
    throw error;
  }
};

const unassignDevice = async (riderId) => {
  try {
    const rider = await RiderHR.findOne({ id: riderId });

    if (!rider) {
      const error = new Error('Rider not found');
      error.statusCode = 404;
      throw error;
    }

    rider.deviceAssigned = false;
    rider.deviceId = null;
    rider.deviceType = null;

    await rider.save();

    return {
      message: 'Device unassigned successfully',
    };
  } catch (error) {
    logger.error('Error unassigning device:', error);
    throw error;
  }
};

module.exports = {
  listRiderAccess,
  updateRiderAccess,
  assignDevice,
  unassignDevice,
};

