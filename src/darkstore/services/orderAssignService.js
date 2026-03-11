/**
 * Order assignment execution - shared between manual/auto assign and auto-assign-on-create.
 * Call performOrderAssignment to assign a picker to an order.
 * Call tryAutoAssignNewOrder to auto-assign a newly created order (best-effort, non-blocking).
 */
const Order = require('../models/Order');
const cache = require('../../utils/cache');
const websocketService = require('../../utils/websocket');
const { ORDER_STATUS } = require('../../constants/pickerEnums');
const { canAssign } = require('../utils/orderStateMachine');
const orderAssignmentService = require('./orderAssignmentService');
const { syncAssignOrderToHhd } = require('../../shared/services/assignOrderSyncService');
const { Order: CustomerOrder } = require('../../customer-backend/models/Order');
const { updateCustomerOrderStatus } = require('../../customer-backend/services/orderService');

const DARKSTORE_TO_CUSTOMER_STATUS = { processing: 'confirmed', ready: 'getting-packed', cancelled: 'cancelled' };

async function propagateToCustomerOrder(darkstoreOrderId, darkstoreStatus) {
  const customerStatus = DARKSTORE_TO_CUSTOMER_STATUS[darkstoreStatus];
  if (!customerStatus) return;
  try {
    const customerOrder = await CustomerOrder.findOne({ orderNumber: darkstoreOrderId }).lean();
    if (customerOrder) {
      await updateCustomerOrderStatus(customerOrder._id, customerStatus, { actor: 'darkstore' });
    }
  } catch (err) {
    console.warn('Customer order status propagation failed (non-blocking):', err.message);
  }
}

async function performOrderAssignment(orderId, pickerId, pickerName, opts = {}) {
  const { userId = '', userRole = 'system' } = opts;

  const order = await Order.findOne({ order_id: orderId });
  if (!order) return null;

  if (!canAssign(order.status)) return null;

  const now = new Date();
  let initials = (pickerName || '')
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .join('')
    .substring(0, 3)
    .toUpperCase();
  // Schema requires 1–3 uppercase A–Z; fallback when name is phone/numeric
  const validInitials = (initials || '').replace(/[^A-Z]/g, '').slice(0, 3);
  initials = validInitials.length > 0 ? validInitials : 'UA';

  order.assignee = { id: pickerId, name: pickerName, initials };
  order.pickerAssignment = {
    pickerId,
    pickerName,
    assignedAt: now,
  };
  order.status = ORDER_STATUS.ASSIGNED;
  order.version = (order.version || 0) + 1;
  order.timeline = order.timeline || [];
  order.timeline.push({
    status: ORDER_STATUS.ASSIGNED,
    timestamp: now,
    updatedBy: userId,
    updatedByRole: userRole || 'picker',
  });
  await order.save();
  await cache.delByPattern('dashboard:*');
  await cache.delByPattern('darkstore:*');

  propagateToCustomerOrder(orderId, order.status);

  try {
    const { logPickerAction } = require('../../picker/services/pickerActionLog.service');
    await logPickerAction({
      actionType: 'order_assigned',
      pickerId: String(pickerId),
      orderId,
      metadata: { pickerName, autoAssign: opts.autoAssign || false },
    });
  } catch (e) { /* non-blocking */ }

  try {
    const event = {
      order_id: orderId,
      store_id: order.store_id,
      status: order.status,
      assignee: order.assignee,
      pickerAssignment: order.pickerAssignment,
      updated_at: now,
    };
    websocketService?.broadcastToRole?.('darkstore', 'order:updated', event);
    websocketService?.broadcastToRole?.('admin', 'order:updated', event);
    websocketService?.broadcastToRole?.('picker', 'order:updated', event);
    websocketService?.broadcast?.('ORDER_STATUS_UPDATED', event);
    websocketService?.broadcast?.('ORDER_ASSIGNED', event);
  } catch (e) { /* non-blocking */ }

  try {
    const syncResult = await syncAssignOrderToHhd(order, pickerId);
    if (syncResult) {
      const assignEvent = {
        orderId,
        order_id: orderId,
        status: 'assigned',
        assignee: order.assignee,
        itemCount: order.item_count,
        store_id: order.store_id,
        hhdOrder: syncResult.hhdOrder,
      };
      const targetUserId = syncResult.hhdOrder?.userId
        ? String(syncResult.hhdOrder.userId)
        : pickerId;
      websocketService?.broadcastToUser?.(targetUserId, 'assignorder:assigned', assignEvent);
      websocketService?.broadcastToRole?.('picker', 'assignorder:assigned', assignEvent);
      websocketService?.broadcast?.('assignorder:created', assignEvent);
    }
  } catch (syncErr) {
    console.warn('assignOrderSyncService failed (non-blocking):', syncErr?.message);
  }

  try {
    const pickerNotificationService = require('../../picker/services/pickerNotification.service');
    await pickerNotificationService.sendOrderAssignedPush(pickerId, orderId, {
      orderItemCount: order.item_count,
      storeId: order.store_id,
    });
  } catch (pushErr) { /* non-blocking */ }

  return order;
}

/**
 * Try to auto-assign a newly created order to a free, active picker.
 * Non-blocking; logs warnings on failure.
 * Set ORDER_ASSIGNMENT_STRATEGY=AUTO_ASSIGN (or ROUND_ROBIN, PICKER_CAPACITY, ZONE_BASED) for this to assign.
 */
async function tryAutoAssignNewOrder(orderId) {
  try {
    const order = await Order.findOne({ order_id: orderId }).lean();
    if (!order || !order.store_id) return;

    const best = await orderAssignmentService.assignToBestPicker(orderId, order.store_id, order);
    if (!best) return;

    await performOrderAssignment(orderId, best.id, best.name, {
      userId: 'system',
      userRole: 'system',
      autoAssign: true,
    });
  } catch (err) {
    console.warn('[tryAutoAssignNewOrder] Failed (non-blocking):', err?.message);
  }
}

module.exports = {
  performOrderAssignment,
  tryAutoAssignNewOrder,
};
