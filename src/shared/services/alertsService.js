const Alert = require('../../common-models/Alert');
const logger = require('../../core/utils/logger');

/**
 * List alerts with filtering and pagination
 */
const listAlerts = async (filters = {}) => {
  try {
    const {
      status = 'all',
      priority,
      type,
      search,
      page = 1,
      limit = 50,
    } = filters;

    const query = {};

    if (status !== 'all') {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (type) {
      query.type = type;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'source.orderId': { $regex: search, $options: 'i' } },
        { 'source.riderName': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const alerts = await Alert.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Map updatedAt to lastUpdatedAt for frontend compatibility
    const alertsWithLastUpdated = alerts.map(alert => ({
      ...alert,
      lastUpdatedAt: alert.lastUpdatedAt || alert.updatedAt || alert.createdAt,
    }));

    const total = await Alert.countDocuments(query);

    return {
      alerts: alertsWithLastUpdated,
      total,
      page,
      limit,
    };
  } catch (error) {
    logger.error('Error listing alerts:', error);
    throw error;
  }
};

/**
 * Get alert by ID
 */
const getAlertById = async (id) => {
  try {
    const alert = await Alert.findOne({ id }).lean();
    if (!alert) {
      throw new Error('Alert not found');
    }
    // Map updatedAt to lastUpdatedAt for frontend compatibility
    return {
      ...alert,
      lastUpdatedAt: alert.lastUpdatedAt || alert.updatedAt || alert.createdAt,
    };
  } catch (error) {
    logger.error('Error getting alert by ID:', error);
    throw error;
  }
};

/**
 * Update alert
 */
const updateAlert = async (id, updates) => {
  try {
    const alert = await Alert.findOne({ id });
    if (!alert) {
      throw new Error('Alert not found');
    }

    if (updates.status) alert.status = updates.status;
    if (updates.priority) alert.priority = updates.priority;
    if (updates.description) alert.description = updates.description;

    alert.lastUpdatedAt = new Date();
    await alert.save();

    return alert.toObject();
  } catch (error) {
    logger.error('Error updating alert:', error);
    throw error;
  }
};

/**
 * Perform action on alert
 */
const performAlertAction = async (id, actionPayload) => {
  try {
    const alert = await Alert.findOne({ id });
    if (!alert) {
      throw new Error('Alert not found');
    }

    const { actionType, metadata } = actionPayload;
    const newTimelineEntry = {
      at: new Date(),
      status: alert.status,
      actor: 'Dispatcher',
    };

    switch (actionType) {
      case 'acknowledge':
        alert.status = 'acknowledged';
        newTimelineEntry.status = 'acknowledged';
        break;
      case 'resolve':
        alert.status = 'resolved';
        newTimelineEntry.status = 'resolved';
        if (metadata?.note) newTimelineEntry.note = metadata.note;
        break;
      case 'reassign_rider':
        alert.status = 'resolved';
        newTimelineEntry.status = 'resolved';
        newTimelineEntry.note = `Reassigned to ${metadata?.riderName || 'Unknown'}`;
        break;
      case 'add_note':
        newTimelineEntry.note = metadata?.note || '';
        break;
      case 'notify_customer':
        newTimelineEntry.note = 'Customer notified via SMS';
        break;
      case 'mark_offline':
        newTimelineEntry.note = 'Rider marked offline';
        break;
    }

    alert.timeline.push(newTimelineEntry);
    const now = new Date();
    alert.lastUpdatedAt = now;
    alert.updatedAt = now; // Also update Mongoose timestamp
    await alert.save();

    const result = alert.toObject();
    // Map updatedAt to lastUpdatedAt for frontend compatibility
    return {
      ...result,
      lastUpdatedAt: result.lastUpdatedAt || result.updatedAt || result.createdAt,
    };
  } catch (error) {
    logger.error('Error performing alert action:', error);
    throw error;
  }
};

/**
 * Mark all pending/open alerts as acknowledged
 */
const markAllAlertsRead = async () => {
  try {
    const result = await Alert.updateMany(
      { status: { $in: ['open'] } },
      { $set: { status: 'acknowledged', lastUpdatedAt: new Date(), updatedAt: new Date() } }
    );
    return {
      modifiedCount: result.modifiedCount,
    };
  } catch (error) {
    logger.error('Error marking all alerts read:', error);
    throw error;
  }
};

/**
 * Clear resolved alerts
 */
const clearResolvedAlerts = async () => {
  try {
    const result = await Alert.deleteMany({
      status: { $in: ['resolved', 'dismissed'] },
    });
    return {
      clearedCount: result.deletedCount,
    };
  } catch (error) {
    logger.error('Error clearing resolved alerts:', error);
    throw error;
  }
};

module.exports = {
  listAlerts,
  getAlertById,
  updateAlert,
  performAlertAction,
  markAllAlertsRead,
  clearResolvedAlerts,
};

