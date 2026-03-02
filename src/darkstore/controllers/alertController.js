const Alert = require('../models/Alert');
const Rider = require('../models/Rider');
const Order = require('../models/Order');
const CustomerCall = require('../models/CustomerCall');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/**
 * Get Alerts List
 * GET /api/darkstore/alerts
 */
const getAlerts = async (req, res) => {
  try {
    logger.info(`[Get Alerts] Request received - storeId: ${req.query.storeId}, status: ${req.query.status || 'all'}`);
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const priority = req.query.priority || 'all';
    const type = req.query.type || 'all';
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }
    if (priority !== 'all') {
      query.priority = priority;
    }
    if (type !== 'all') {
      query.type = type;
    }

    // Get total count
    const totalItems = await Alert.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get alerts
    let alerts = await Alert.find(query)
      .sort({ priority: -1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      alerts = alerts.filter(alert => 
        alert.title.toLowerCase().includes(searchLower) ||
        alert.description.toLowerCase().includes(searchLower) ||
        alert.source?.orderId?.toLowerCase().includes(searchLower) ||
        alert.source?.riderName?.toLowerCase().includes(searchLower)
      );
    }

    // Calculate summary
    const allAlerts = await Alert.find({ store_id: storeId }).lean();
    const criticalCount = allAlerts.filter(a => a.priority === 'critical' && a.status === 'open').length;
    const openCount = allAlerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed').length;
    const resolvedCount = allAlerts.filter(a => a.status === 'resolved' || a.status === 'dismissed').length;

    // Transform to match YAML response format
    const transformedAlerts = alerts.map(alert => ({
      id: alert.alert_id,
      type: alert.type,
      title: alert.title,
      description: alert.description,
      priority: alert.priority,
      status: alert.status,
      createdAt: alert.created_at,
      lastUpdatedAt: alert.updated_at,
      source: alert.source || {},
      actionsSuggested: alert.actionsSuggested || [],
      timeline: alert.timeline || []
    }));

    res.status(200).json({
      success: true,
      alerts: transformedAlerts,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
      summary: {
        critical_count: criticalCount,
        open_count: openCount,
        resolved_count: resolvedCount,
      },
    });
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch alerts',
    });
  }
};

/**
 * Get Alert Details
 * GET /api/darkstore/alerts/:alertId
 */
const getAlertById = async (req, res) => {
  try {
    const { alertId } = req.params;

    if (!alertId) {
      return res.status(400).json({
        success: false,
        error: 'alertId is required',
      });
    }

    logger.info(`[Get Alert By ID] Looking for alert_id: ${alertId}`);
    const alert = await Alert.findOne({ alert_id: alertId }).lean();
    
    if (!alert) {
      // Try to find any alert to help debug
      const sampleAlert = await Alert.findOne({}).lean();
      logger.info(`[Get Alert By ID] Alert not found. Sample alert_id in DB: ${sampleAlert?.alert_id || 'none'}`);
      return res.status(404).json({
        success: false,
        error: `Alert not found with ID: ${alertId}`,
        hint: sampleAlert ? `Sample alert_id in database: ${sampleAlert.alert_id}` : 'No alerts found in database. Run seed script first.',
      });
    }

    // Transform to match YAML response format
    const transformedAlert = {
      id: alert.alert_id,
      type: alert.type,
      title: alert.title,
      description: alert.description,
      priority: alert.priority,
      status: alert.status,
      createdAt: alert.created_at,
      lastUpdatedAt: alert.updated_at,
      source: alert.source || {},
      actionsSuggested: alert.actionsSuggested || [],
      timeline: alert.timeline || []
    };

    res.status(200).json({
      success: true,
      alert: transformedAlert,
    });
  } catch (error) {
    logger.error('Get alert by ID error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch alert',
    });
  }
};

/**
 * Perform Alert Action
 * POST /api/darkstore/alerts/:alertId/action
 */
const performAlertAction = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { actionType, metadata } = req.body;

    if (!alertId) {
      return res.status(400).json({
        success: false,
        error: 'alertId is required',
      });
    }

    if (!actionType) {
      return res.status(400).json({
        success: false,
        error: 'actionType is required',
      });
    }

    logger.info(`[Perform Alert Action] Looking for alert_id: ${alertId}, actionType: ${actionType}`);
    const alert = await Alert.findOne({ alert_id: alertId });
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: `Alert not found with ID: ${alertId}`,
      });
    }

    const now = new Date().toISOString();
    const timelineEntry = {
      at: now,
      status: alert.status,
      actor: metadata?.actor || 'Dispatcher',
    };

    // Side Effects based on actionType
    switch (actionType) {
      case 'acknowledge':
        alert.status = 'acknowledged';
        timelineEntry.status = 'acknowledged';
        timelineEntry.note = 'Alert acknowledged by dispatcher';
        break;

      case 'resolve':
        alert.status = 'resolved';
        timelineEntry.status = 'resolved';
        timelineEntry.note = metadata?.note || 'Alert marked as resolved';
        break;

      case 'reassign_rider':
        if (metadata?.riderId && metadata?.riderName) {
          const oldRiderName = alert.source.riderName;
          alert.source.riderId = metadata.riderId;
          alert.source.riderName = metadata.riderName;
          alert.status = 'resolved';
          timelineEntry.status = 'resolved';
          timelineEntry.note = `Rider reassigned from ${oldRiderName || 'unassigned'} to ${metadata.riderName}`;

          // Update related Order if orderId is present
          if (alert.source.orderId) {
            await Order.findOneAndUpdate(
              { order_id: alert.source.orderId },
              { 
                $set: { 
                  'assignee.id': metadata.riderId,
                  'assignee.name': metadata.riderName,
                  'assignee.initials': metadata.riderName.split(' ').map(n => n[0]).join('').toUpperCase()
                } 
              }
            );
          }
        } else {
          throw new Error('riderId and riderName are required for reassign_rider action');
        }
        break;

      case 'notify_customer':
        timelineEntry.note = metadata?.message || 'Customer notified via SMS';
        
        // Log notification in CustomerCall model
        if (alert.source.orderId) {
          const callId = `CALL-${Math.floor(100000 + Math.random() * 900000)}`;
          await CustomerCall.create({
            call_id: callId,
            order_id: alert.source.orderId,
            store_id: alert.store_id,
            reason: metadata?.message || 'Operational Alert Notification',
            status: 'completed',
            duration: 0
          });
        }
        break;

      case 'mark_offline':
        timelineEntry.note = 'Rider marked offline due to operational issue';
        
        // Update Rider status
        if (alert.source.riderId) {
          await Rider.findOneAndUpdate(
            { rider_id: alert.source.riderId },
            { $set: { status: 'offline', last_update: now } }
          );
        }
        break;

      case 'call_rider':
        timelineEntry.note = 'Dispatcher initiated call to rider';
        // Potential side effect: Trigger VoIP or log call
        break;

      case 'view_location':
        timelineEntry.note = 'Dispatcher viewed live location of rider/vehicle';
        break;

      case 'add_note':
        if (metadata?.note) {
          timelineEntry.note = metadata.note;
        } else {
          throw new Error('note is required for add_note action');
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action type',
        });
    }

    // Add timeline entry
    if (!alert.timeline) {
      alert.timeline = [];
    }
    alert.timeline.push(timelineEntry);
    alert.updated_at = now;

    await alert.save();

    // Reload alert to get latest state
    const updatedAlert = await Alert.findOne({ alert_id: alertId }).lean();

    // Transform to full alert object (matching frontend format)
    const transformedAlert = {
      id: updatedAlert.alert_id,
      type: updatedAlert.type,
      title: updatedAlert.title,
      description: updatedAlert.description,
      priority: updatedAlert.priority,
      status: updatedAlert.status,
      createdAt: updatedAlert.created_at,
      lastUpdatedAt: updatedAlert.updated_at,
      source: updatedAlert.source || {},
      actionsSuggested: updatedAlert.actionsSuggested || [],
      timeline: updatedAlert.timeline || [],
    };

    let message = 'Action performed successfully';
    if (actionType === 'reassign_rider') {
      message = `Rider reassigned to ${metadata.riderName}`;
    } else if (actionType === 'resolve') {
      message = 'Alert resolved successfully';
    } else if (actionType === 'acknowledge') {
      message = 'Alert acknowledged successfully';
    } else if (actionType === 'notify_customer') {
      message = 'Customer notified successfully';
    } else if (actionType === 'add_note') {
      message = 'Note added successfully';
    } else if (actionType === 'mark_offline') {
      message = 'Rider marked offline successfully';
    } else if (actionType === 'call_rider') {
      message = 'Call initiated to rider';
    }

    res.status(200).json({
      success: true,
      alert: transformedAlert,
      message: message,
    });
  } catch (error) {
    logger.error('Perform alert action error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform action',
    });
  }
};

/**
 * Clear Resolved Alerts
 * DELETE /api/darkstore/alerts/resolved
 */
const clearResolvedAlerts = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const archive = req.query.archive !== 'false';

    const query = {
      store_id: storeId,
      status: { $in: ['resolved', 'dismissed'] },
    };

    const count = await Alert.countDocuments(query);

    if (archive) {
      // In a real implementation, you would move to archive table
      // For now, we'll just delete them
      await Alert.deleteMany(query);
    } else {
      await Alert.deleteMany(query);
    }

    res.status(200).json({
      success: true,
      deleted_count: count,
      message: 'Resolved alerts cleared successfully',
    });
  } catch (error) {
    logger.error('Clear resolved alerts error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear resolved alerts',
    });
  }
};

module.exports = {
  getAlerts,
  getAlertById,
  performAlertAction,
  clearResolvedAlerts,
};

