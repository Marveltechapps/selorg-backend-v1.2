/**
 * Operational Alerts Job
 * Runs periodically to create ORDER_SLA_BREACHED and PICKER_INACTIVE alerts.
 * Should be run every 1-2 minutes via setInterval or cron.
 */
const Order = require('../models/Order');
const OperationalAlert = require('../models/OperationalAlert');
const PickerUser = require('../../picker/models/user.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');

const INACTIVE_THRESHOLD_MS = 60 * 1000; // 60 seconds
const PICKER_INACTIVE_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes - don't create duplicate for same picker+order

let websocketService;
try {
  websocketService = require('../../utils/websocket');
} catch (_) {
  websocketService = null;
}

/**
 * Check and create ORDER_SLA_BREACHED alerts for orders past SLA
 */
async function processSlaBreachedAlerts() {
  const now = new Date();
  const orders = await Order.find({
    status: { $in: ['ASSIGNED', 'PICKING'] },
    sla_deadline: { $lt: now },
    sla_status: { $ne: 'critical' },
  }).lean();

  for (const order of orders) {
    try {
      const existingAlert = await OperationalAlert.findOne({
        alertType: 'ORDER_SLA_BREACHED',
        orderId: order.order_id,
        status: 'open',
      }).lean();
      if (existingAlert) continue;

      const alert = await OperationalAlert.create({
        alertType: 'ORDER_SLA_BREACHED',
        storeId: order.store_id || '',
        orderId: order.order_id,
        pickerId: order.pickerAssignment?.pickerId || order.assignee?.id || '',
        title: `SLA breached: Order ${order.order_id}`,
        description: `Order ${order.order_id} has exceeded its SLA deadline.`,
        metadata: { slaDeadline: order.sla_deadline, status: order.status },
        status: 'open',
      });

      await Order.updateOne(
        { order_id: order.order_id },
        { $set: { sla_status: 'critical' } }
      );

      try {
        if (websocketService?.broadcastToRole) {
          websocketService.broadcastToRole('darkstore', 'OPERATIONAL_ALERT', alert);
          websocketService.broadcastToRole('admin', 'OPERATIONAL_ALERT', alert);
        }
      } catch (e) { /* non-blocking */ }
    } catch (err) {
      console.warn('[operationalAlertsJob] ORDER_SLA_BREACHED failed for', order.order_id, err?.message);
    }
  }
}

/**
 * Check and create PICKER_INACTIVE alerts for pickers with active order but no recent heartbeat
 */
async function processPickerInactiveAlerts() {
  const cutoff = new Date(Date.now() - INACTIVE_THRESHOLD_MS);
  const debounceCutoff = new Date(Date.now() - PICKER_INACTIVE_DEBOUNCE_MS);

  const pickers = await PickerUser.find({
    status: PICKER_STATUS.ACTIVE,
    activeOrderId: { $exists: true, $ne: null, $ne: '' },
    lastSeenAt: { $lt: cutoff },
  }).lean();

  for (const picker of pickers) {
    const pickerId = String(picker._id);
    const orderId = picker.activeOrderId;

    try {
      const recentAlert = await OperationalAlert.findOne({
        alertType: 'PICKER_INACTIVE',
        pickerId,
        orderId,
        status: 'open',
        createdAt: { $gte: debounceCutoff },
      }).lean();
      if (recentAlert) continue;

      const alert = await OperationalAlert.create({
        alertType: 'PICKER_INACTIVE',
        storeId: '',
        orderId: orderId || '',
        pickerId,
        title: `Picker inactive: ${picker.name || picker.phone || pickerId}`,
        description: `Picker has not sent heartbeat for over 60 seconds while assigned to order ${orderId}.`,
        metadata: { lastSeenAt: picker.lastSeenAt, activeOrderId: orderId },
        status: 'open',
      });

      try {
        if (websocketService?.broadcastToRole) {
          websocketService.broadcastToRole('darkstore', 'OPERATIONAL_ALERT', alert);
          websocketService.broadcastToRole('admin', 'OPERATIONAL_ALERT', alert);
        }
      } catch (e) { /* non-blocking */ }
    } catch (err) {
      console.warn('[operationalAlertsJob] PICKER_INACTIVE failed for', pickerId, err?.message);
    }
  }
}

/**
 * Run the full operational alerts check
 */
async function run() {
  try {
    await processSlaBreachedAlerts();
    await processPickerInactiveAlerts();
  } catch (err) {
    console.error('[operationalAlertsJob] Run failed:', err?.message);
  }
}

/**
 * Start the job on an interval (default: every 90 seconds)
 * @param {number} intervalMs - Interval in milliseconds
 * @returns {NodeJS.Timeout} - The interval handle for cleanup
 */
function start(intervalMs = 90 * 1000) {
  run(); // Run immediately
  return setInterval(run, intervalMs);
}

module.exports = { run, start, processSlaBreachedAlerts, processPickerInactiveAlerts };
