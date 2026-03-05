const Order = require('../models/Order');
const OperationalAlert = require('../models/OperationalAlert');
const RTOAlert = require('../models/RTOAlert');
const { logPickerAction, getLogsByOrder } = require('../../picker/services/pickerActionLog.service');
const CustomerCall = require('../models/CustomerCall');
const AlertHistory = require('../models/AlertHistory');
const { generateId } = require('../../utils/helpers');
const cache = require('../../utils/cache');
const { updateCustomerOrderStatus } = require('../../customer-backend/services/orderService');
const { Order: CustomerOrder } = require('../../customer-backend/models/Order');
const { triggerAutoRefundForMissingItems } = require('../../customer-backend/services/autoRefundService');
const websocketService = require('../../utils/websocket');
const { ORDER_STATUS } = require('../../constants/pickerEnums');
const { validateTransition, canAssign, canStartPicking, canCompletePicking } = require('../utils/orderStateMachine');
const orderAssignmentService = require('../services/orderAssignmentService');

const DARKSTORE_TO_CUSTOMER_STATUS = {
  processing: 'confirmed',
  ready: 'getting-packed',
  cancelled: 'cancelled',
};

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

/**
 * Get Orders
 * GET /api/darkstore/orders
 */
const getOrders = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
    const status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (status) {
      query.status = status;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const ordersMissingItems = orders.filter((o) => !o.items || o.items.length === 0);
    let customerItemsMap = {};
    if (ordersMissingItems.length > 0) {
      try {
        const ids = ordersMissingItems.map((o) => o.order_id);
        const custOrders = await CustomerOrder.find({ orderNumber: { $in: ids } }, { orderNumber: 1, items: 1 }).lean();
        for (const co of custOrders) {
          customerItemsMap[co.orderNumber] = (co.items || []).map((it) => ({
            productName: it.productName || 'Item',
            quantity: it.quantity || 1,
            price: it.price || 0,
            image: it.image || '',
            variantSize: it.variantSize || '',
          }));
        }
      } catch (_) { /* non-blocking fallback */ }
    }

    const formattedOrders = orders.map((order) => {
      const rawPhone = order.customer_phone || '';
      const maskedPhone = rawPhone.length >= 8
        ? rawPhone.slice(0, 2) + '******' + rawPhone.slice(-2)
        : rawPhone ? '******' : '';
      const resolvedItems = (order.items && order.items.length > 0)
        ? order.items.map((it) => ({
            productName: it.productName || 'Item',
            quantity: it.quantity || 1,
            price: it.price || 0,
            image: it.image || '',
            variantSize: it.variantSize || '',
          }))
        : (customerItemsMap[order.order_id] || []);
      return {
        ...order,
        items: resolvedItems,
        customer_name: order.customer_name || 'Customer',
        customer_phone: maskedPhone,
      };
    });

    res.status(200).json({
      success: true,
      orders: formattedOrders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch orders',
    });
  }
};

/**
 * Call customer for RTO risk order
 * POST /api/darkstore/orders/:orderId/call-customer
 */
const callCustomer = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, notes } = req.body || {};
    
    // Find order to get store_id
    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }
    
    const callId = generateId('CALL');
    
    // Generate random phone number for history
    const calledNumber = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    
    // Create customer call record
    const customerCall = new CustomerCall({
      call_id: callId,
      order_id: orderId,
      store_id: order.store_id,
      reason: reason || 'RTO risk - customer call initiated',
      status: 'initiated',
    });
    await customerCall.save();
    
    // Save action history
    const alertHistory = new AlertHistory({
      entity_type: 'ORDER',
      entity_id: orderId,
      alert_type: 'RTO',
      action: 'CALL_CUSTOMER',
      metadata: {
        call_id: callId,
        called_number: calledNumber,
        call_status: 'initiated',
        reason: reason || 'RTO risk - customer call initiated',
      },
      performed_by: 'system',
      store_id: order.store_id,
    });
    await alertHistory.save();
    
    // Update order RTO risk status if needed
    if (!order.rto_risk) {
      order.rto_risk = true;
      if (reason) order.rto_reason = reason;
      if (notes) order.rto_notes = notes;
      await order.save();
    }
    await cache.delByPattern('dashboard:*');

    res.status(200).json({
      success: true,
      call_id: callId,
      status: 'initiated',
      called_number: calledNumber, // Include in response for frontend
      message: `Customer call initiated for order ${orderId}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate customer call',
    });
  }
};

/**
 * Mark order as RTO
 * POST /api/darkstore/orders/:orderId/mark-rto
 */
const markRTO = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, notes, rto_status } = req.body || {};
    
    // Find and update order
    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }
    
    // Save previous status for history
    const previousStatus = order.status;
    
    // Update order with RTO information
    order.status = 'rto';
    order.rto_status = rto_status || 'marked_rto';
    order.rto_risk = true;
    
    if (reason) order.rto_reason = reason;
    if (notes) order.rto_notes = notes;
    
    await order.save();
    
    // Save action history
    const alertHistory = new AlertHistory({
      entity_type: 'ORDER',
      entity_id: orderId,
      alert_type: 'RTO',
      action: 'MARK_RTO',
      metadata: {
        previous_status: previousStatus,
        new_status: 'rto',
        rto_status: rto_status || 'marked_rto',
        reason: reason || 'Customer unreachable',
        notes: notes || '',
      },
      performed_by: 'system',
      store_id: order.store_id,
    });
    await alertHistory.save();
    
    // Mark RTO alert as resolved
    await RTOAlert.updateMany(
      { order_id: orderId, is_resolved: false },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        },
      }
    );
    await cache.delByPattern('dashboard:*');

    try {
      const rtoEvent = {
        order_id: orderId,
        store_id: order.store_id,
        status: 'rto',
        rto_status: order.rto_status,
        customer_name: order.customer_name || 'Customer',
        total_bill: order.total_bill || 0,
        updated_at: new Date(),
      };
      websocketService?.broadcastToRole?.('darkstore', 'order:updated', rtoEvent);
      websocketService?.broadcastToRole?.('admin', 'order:updated', rtoEvent);
      websocketService?.broadcastToRole?.('finance', 'order:updated', rtoEvent);
    } catch (e) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      order_id: orderId,
      rto_status: order.rto_status,
      message: `Order ${orderId} marked as RTO`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark order as RTO',
    });
  }
};

/**
 * Get alert history for an entity
 * GET /api/darkstore/alerts/history
 */
const getAlertHistory = async (req, res) => {
  try {
    const { entityType, entityId, alertType } = req.query;
    
    if (!entityType || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'entityType and entityId are required',
      });
    }
    
    const query = {
      entity_type: entityType.toUpperCase(),
      entity_id: entityId,
    };
    
    if (alertType) {
      query.alert_type = alertType.toUpperCase();
    }
    
    const history = await AlertHistory.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      history: history.map((item) => ({
        id: item._id.toString(),
        action: item.action,
        metadata: item.metadata,
        performed_by: item.performed_by,
        performed_at: item.createdAt,
        alert_type: item.alert_type,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch alert history',
    });
  }
};

/**
 * Update order status or urgency
 * PATCH /api/darkstore/orders/:orderId
 */
const updateOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, urgency } = req.body || {};

    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const statusMap = {
      Queued: 'new',
      Picking: 'processing',
      Packing: 'ready',
      [ORDER_STATUS.ASSIGNED]: ORDER_STATUS.ASSIGNED,
      [ORDER_STATUS.PICKING]: ORDER_STATUS.PICKING,
      [ORDER_STATUS.PICKED]: ORDER_STATUS.PICKED,
      [ORDER_STATUS.PACKED]: ORDER_STATUS.PACKED,
      [ORDER_STATUS.READY_FOR_DISPATCH]: ORDER_STATUS.READY_FOR_DISPATCH,
    };
    const urgencyMap = { normal: 'safe', warning: 'warning', critical: 'critical' };

    if (status && statusMap[status]) {
      const newStatus = statusMap[status];
      validateTransition(order.status, newStatus);
      order.status = newStatus;
    }
    if (urgency && urgencyMap[urgency]) {
      order.sla_status = urgencyMap[urgency];
    }

    await order.save();
    await cache.delByPattern('dashboard:*');

    propagateToCustomerOrder(orderId, order.status);

    try {
      const updateEvent = {
        order_id: orderId,
        store_id: order.store_id,
        status: order.status,
        sla_status: order.sla_status,
        customer_name: order.customer_name || 'Customer',
        total_bill: order.total_bill || 0,
        payment_status: order.payment_status || 'pending',
        updated_at: new Date(),
      };
      websocketService?.broadcastToRole?.('darkstore', 'order:updated', updateEvent);
      websocketService?.broadcastToRole?.('admin', 'order:updated', updateEvent);
      websocketService?.broadcastToRole?.('finance', 'order:updated', updateEvent);
    } catch (e) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      order_id: orderId,
      status: order.status,
      sla_status: order.sla_status,
      message: 'Order updated',
    });
  } catch (error) {
    const code = error.statusCode || 500;
    res.status(code).json({
      success: false,
      error: error.message || 'Failed to update order',
    });
  }
};

/**
 * Cancel order
 * POST /api/darkstore/orders/:orderId/cancel
 */
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};

    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    validateTransition(order.status, 'cancelled');
    order.status = 'cancelled';
    if (reason) order.rto_reason = reason;
    await order.save();
    await cache.delByPattern('dashboard:*');

    try {
      const { logAdminAction } = require('../../admin/services/adminAudit.service');
      const adminUserId = req.user?.userId || req.user?.id;
      await logAdminAction({
        module: 'admin',
        action: 'order_cancelled',
        entityType: 'order',
        entityId: orderId,
        userId: adminUserId,
        details: { storeId: order.store_id, reason: reason || '', cancelledBy: req.user?.role || 'admin' },
        req,
      });
    } catch (auditErr) { /* non-blocking */ }

    // Propagate cancellation to the customer order so the customer app reflects it
    try {
      const customerOrder = await CustomerOrder.findOne({ orderNumber: orderId }).lean();
      if (customerOrder) {
        await updateCustomerOrderStatus(customerOrder._id, 'cancelled', {
          actor: 'admin',
          note: reason || 'Order cancelled by admin',
        });
      }
    } catch (err) {
      console.warn('Customer order cancellation propagation failed (non-blocking):', err.message);
    }

    try {
      const cancelEvent = {
        order_id: orderId,
        store_id: order.store_id,
        status: 'cancelled',
        customer_name: order.customer_name || 'Customer',
        total_bill: order.total_bill || 0,
        payment_status: order.payment_status || 'pending',
        payment_method: order.payment_method || 'cash',
        reason: reason || '',
        updated_at: new Date(),
      };
      websocketService?.broadcastToRole?.('darkstore', 'order:cancelled', cancelEvent);
      websocketService?.broadcastToRole?.('admin', 'order:cancelled', cancelEvent);
      websocketService?.broadcastToRole?.('finance', 'order:cancelled', cancelEvent);
      websocketService?.broadcast?.('order:cancelled', cancelEvent);
    } catch (e) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      order_id: orderId,
      message: `Order ${orderId} cancelled`,
    });
  } catch (error) {
    const code = error.statusCode || 500;
    res.status(code).json({
      success: false,
      error: error.message || 'Failed to cancel order',
    });
  }
};

/**
 * Assign picker to order
 * PATCH /api/v1/darkstore/orders/:orderId/assign
 * Body: { pickerId, pickerName } or { autoAssign: true } to use Order Assignment Engine
 */
const assignOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pickerId, pickerName, autoAssign } = req.body || {};
    const userId = req.user?.id || '';
    const userRole = req.user?.role || '';

    let resolvedPickerId = pickerId;
    let resolvedPickerName = pickerName;

    if (autoAssign) {
      const order = await Order.findOne({ order_id: orderId }).lean();
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      const best = await orderAssignmentService.assignToBestPicker(orderId, order.store_id, order);
      if (!best) {
        return res.status(400).json({
          success: false,
          error: 'No available picker for auto-assign. Try manual assignment or ensure ORDER_ASSIGNMENT_STRATEGY is set.',
        });
      }
      resolvedPickerId = best.id;
      resolvedPickerName = best.name;
    }

    if (!resolvedPickerId || !resolvedPickerName) {
      return res.status(400).json({
        success: false,
        error: 'pickerId and pickerName are required (or use autoAssign: true)',
      });
    }

    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (!canAssign(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Order cannot be assigned in current status "${order.status}". Order must be new, processing, or ready.`,
      });
    }

    const now = new Date();
    const initials = (resolvedPickerName || '')
      .split(/\s+/)
      .map((s) => s.charAt(0))
      .join('')
      .substring(0, 3)
      .toUpperCase() || 'UA';

    order.assignee = { id: resolvedPickerId, name: resolvedPickerName, initials };
    order.pickerAssignment = {
      pickerId: resolvedPickerId,
      pickerName: resolvedPickerName,
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
      logPickerAction({
        actionType: 'order_assigned',
        pickerId: String(resolvedPickerId),
        orderId,
        metadata: { pickerName: resolvedPickerName, autoAssign: !!autoAssign },
      }).catch(() => {});
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
      websocketService?.broadcast?.('ORDER_STATUS_UPDATED', event);
      websocketService?.broadcast?.('ORDER_ASSIGNED', event);
    } catch (e) { /* non-blocking */ }

    try {
      const pickerNotificationService = require('../../picker/services/pickerNotification.service');
      await pickerNotificationService.sendOrderAssignedPush(resolvedPickerId, orderId, {
        orderItemCount: order.item_count,
        storeId: order.store_id,
      });
    } catch (pushErr) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      order_id: orderId,
      status: order.status,
      assignee: order.assignee,
      pickerAssignment: order.pickerAssignment,
      version: order.version,
      message: `Order ${orderId} assigned to ${resolvedPickerName}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign order',
    });
  }
};

/**
 * Start picking
 * PATCH /api/v1/darkstore/orders/:orderId/start-picking
 * Uses optimistic locking if requestVersion provided.
 */
const startPicking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { requestVersion } = req.body || {};
    const userId = req.user?.id || '';
    const userRole = req.user?.role || '';

    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (requestVersion != null && order.version !== requestVersion) {
      return res.status(409).json({
        success: false,
        error: 'Order was modified. Please refresh and try again.',
        currentVersion: order.version,
      });
    }

    if (!canStartPicking(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot start picking: order must be ASSIGNED. Current status: "${order.status}"`,
      });
    }

    const now = new Date();
    order.status = ORDER_STATUS.PICKING;
    order.version = (order.version || 0) + 1;
    order.pickingData = order.pickingData || {};
    order.pickingData.startTime = now;
    order.timeline = order.timeline || [];
    order.timeline.push({
      status: ORDER_STATUS.PICKING,
      timestamp: now,
      updatedBy: userId,
      updatedByRole: userRole || 'picker',
    });
    await order.save();
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('darkstore:*');

    propagateToCustomerOrder(orderId, 'processing');

    const pickerIdForLog = order.pickerAssignment?.pickerId || order.assignee?.id || userId;
    if (pickerIdForLog) {
      try {
        logPickerAction({
          actionType: 'start_picking',
          pickerId: String(pickerIdForLog),
          orderId,
        }).catch(() => {});
      } catch (e) { /* non-blocking */ }
    }
    try {
      const event = {
        order_id: orderId,
        store_id: order.store_id,
        status: order.status,
        pickingData: order.pickingData,
        updated_at: now,
      };
      websocketService?.broadcastToRole?.('darkstore', 'order:updated', event);
      websocketService?.broadcastToRole?.('admin', 'order:updated', event);
      websocketService?.broadcast?.('ORDER_STATUS_UPDATED', event);
      websocketService?.broadcast?.('PICKING_STARTED', event);
    } catch (e) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      order_id: orderId,
      status: order.status,
      pickingData: order.pickingData,
      version: order.version,
      message: `Order ${orderId} picking started`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start picking',
    });
  }
};

/**
 * Complete picking
 * PATCH /api/v1/darkstore/orders/:orderId/complete-picking
 * Body: { requestVersion?, pickDuration?, accuracy?, missingItems?: [{ productName, orderedQty, scannedQty, reason? }] }
 * Triggers refund if scannedQty < orderedQty for any item.
 */
const completePicking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { requestVersion, pickDuration, accuracy, missingItems: reqMissingItems } = req.body || {};
    const userId = req.user?.id || '';
    const userRole = req.user?.role || '';

    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (requestVersion != null && order.version !== requestVersion) {
      return res.status(409).json({
        success: false,
        error: 'Order was modified. Please refresh and try again.',
        currentVersion: order.version,
      });
    }

    if (!canCompletePicking(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot complete picking: order must be PICKING. Current status: "${order.status}"`,
      });
    }

    const now = new Date();
    order.status = ORDER_STATUS.PICKED;
    order.version = (order.version || 0) + 1;
    order.pickingData = order.pickingData || {};
    order.pickingData.endTime = now;
    if (pickDuration != null) order.pickingData.pickDuration = pickDuration;
    if (accuracy != null) order.pickingData.accuracy = accuracy;
    if (Array.isArray(reqMissingItems) && reqMissingItems.length > 0) {
      order.pickingData.missingItems = reqMissingItems.map((m) => ({
        productName: m.productName || '',
        orderedQty: m.orderedQty ?? 0,
        scannedQty: m.scannedQty ?? 0,
        reason: m.reason || '',
        replacementSku: m.replacementSku || '',
        replacementProductName: m.replacementProductName || '',
        replacementQty: m.replacementQty ?? 0,
      }));
    } else {
      order.pickingData.missingItems = order.pickingData.missingItems || [];
    }

    order.timeline = order.timeline || [];
    order.timeline.push({
      status: ORDER_STATUS.PICKED,
      timestamp: now,
      updatedBy: userId,
      updatedByRole: userRole || 'picker',
    });

    if (!order.pickingData.startTime && order.pickingData.endTime) {
      const start = order.timeline.find((t) => t.status === ORDER_STATUS.PICKING);
      if (start) order.pickingData.startTime = start.timestamp;
    }
    if (order.pickingData.startTime && order.pickingData.endTime && !order.pickingData.pickDuration) {
      order.pickingData.pickDuration = Math.round(
        (new Date(order.pickingData.endTime) - new Date(order.pickingData.startTime)) / 1000
      );
    }

    await order.save();
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('darkstore:*');

    propagateToCustomerOrder(orderId, 'ready');

    let refundTriggered = false;
    const missingForRefund = (order.pickingData.missingItems || []).filter(
      (m) => (m.orderedQty ?? 0) > (m.scannedQty ?? 0)
    );
    if (missingForRefund.length > 0) {
      try {
        const customerOrder = await CustomerOrder.findOne({ orderNumber: orderId }).lean();
        if (customerOrder) {
          const items = customerOrder.items || [];
          const missingItemsForAutoRefund = missingForRefund.map((m) => {
            const orderedQty = m.orderedQty ?? 0;
            const scannedQty = m.scannedQty ?? 0;
            const qtyToRefund = orderedQty - scannedQty;
            const item = items.find((i) => (i.productName || '').toLowerCase() === (m.productName || '').toLowerCase());
            const price = item ? (item.price || 0) : 0;
            const refundAmount = price * qtyToRefund;
            return {
              productId: item?.productId,
              productName: m.productName || 'Item',
              quantity: qtyToRefund,
              price,
              refundAmount,
            };
          });
          const refund = await triggerAutoRefundForMissingItems(customerOrder._id, missingItemsForAutoRefund);
          if (refund) refundTriggered = true;
        }
      } catch (err) {
        console.warn('Missing items refund trigger failed (non-blocking):', err.message);
      }

      try {
        websocketService?.broadcast?.('REFUND_TRIGGERED', {
          order_id: orderId,
          missingCount: missingForRefund.length,
          refundTriggered,
        });
      } catch (e) { /* non-blocking */ }
    }

    const pickerIdForLog = order.pickerAssignment?.pickerId || order.assignee?.id || userId;
    if (pickerIdForLog) {
      try {
        logPickerAction({
          actionType: 'complete_picking',
          pickerId: String(pickerIdForLog),
          orderId,
          metadata: { refundTriggered },
        }).catch(() => {});
      } catch (e) { /* non-blocking */ }

      try {
        const walletService = require('../../picker/services/wallet.service');
        await walletService.creditForOrder(pickerIdForLog, orderId, undefined, { storeId: order.store_id });
      } catch (creditErr) {
        console.warn('[completePicking] Per-order earnings credit failed:', creditErr?.message);
      }
    }
    try {
      const event = {
        order_id: orderId,
        store_id: order.store_id,
        status: order.status,
        pickingData: order.pickingData,
        refundTriggered,
        updated_at: now,
      };
      websocketService?.broadcastToRole?.('darkstore', 'order:updated', event);
      websocketService?.broadcastToRole?.('admin', 'order:updated', event);
      websocketService?.broadcast?.('ORDER_STATUS_UPDATED', event);
      websocketService?.broadcast?.('ORDER_COMPLETED', event);
      if (missingForRefund.length > 0) {
        websocketService?.broadcast?.('MISSING_ITEM_REPORTED', {
          order_id: orderId,
          store_id: order.store_id,
          missingItems: order.pickingData.missingItems,
          pickerId: pickerIdForLog,
          updated_at: now,
        });
        if (missingForRefund.length >= 2) {
          try {
            const alert = await OperationalAlert.create({
              alertType: 'MULTIPLE_MISSING_ITEMS',
              storeId: order.store_id,
              orderId,
              pickerId: pickerIdForLog || '',
              title: `Multiple missing items: ${orderId}`,
              description: `${missingForRefund.length} items missing in order ${orderId}`,
              metadata: { missingItems: order.pickingData.missingItems },
              status: 'open',
            });
            websocketService?.broadcastToRole?.('darkstore', 'OPERATIONAL_ALERT', alert);
            websocketService?.broadcastToRole?.('admin', 'OPERATIONAL_ALERT', alert);
          } catch (err) { /* non-blocking */ }
        }
      }
    } catch (e) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      order_id: orderId,
      status: order.status,
      pickingData: order.pickingData,
      refundTriggered,
      version: order.version,
      message: `Order ${orderId} picking completed`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete picking',
    });
  }
};

/**
 * Get order action logs (audit)
 * GET /api/v1/darkstore/orders/:orderId/action-logs
 * Query: limit
 */
const getOrderActionLogs = async (req, res) => {
  try {
    const { orderId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const logs = await getLogsByOrder(orderId, { limit });
    res.status(200).json({
      success: true,
      order_id: orderId,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch order action logs',
    });
  }
};

module.exports = {
  getOrders,
  callCustomer,
  markRTO,
  updateOrder,
  cancelOrder,
  getAlertHistory,
  assignOrder,
  startPicking,
  completePicking,
  getOrderActionLogs,
};

