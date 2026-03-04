/**
 * Bag/Rack controller – PATCH /api/v1/darkstore/orders/:orderId/bag-rack
 * Picker/HHD scans bag QR, assigns rack. Updates order.bagId, order.rackLocation.
 * Sets status READY_FOR_DISPATCH when both bagId and rackLocation are set.
 * Requires darkstore, admin, super_admin, picker, or hhd auth.
 */
const Order = require('../models/Order');
const cache = require('../../utils/cache');
const websocketService = require('../../utils/websocket');
const { ORDER_STATUS } = require('../../constants/pickerEnums');
const { logPickerAction } = require('../../picker/services/pickerActionLog.service');

async function updateBagRack(req, res) {
  try {
    const { orderId } = req.params;
    const { bagId, rackLocation } = req.body || {};
    const userId = req.user?.userId || req.user?.id || '';
    const userRole = req.user?.role || '';

    if (!bagId && !rackLocation) {
      return res.status(400).json({
        success: false,
        error: 'At least one of bagId or rackLocation is required',
      });
    }

    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const now = new Date();
    const updates = [];
    if (bagId != null && bagId !== '') {
      order.bagId = String(bagId).trim();
      updates.push(`bagId=${order.bagId}`);
    }
    if (rackLocation != null && rackLocation !== '') {
      order.rackLocation = String(rackLocation).trim();
      updates.push(`rackLocation=${order.rackLocation}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one non-empty bagId or rackLocation is required',
      });
    }

    order.timeline = order.timeline || [];
    order.timeline.push({
      status: 'BAG_RACK_ASSIGNED',
      timestamp: now,
      updatedBy: userId,
      updatedByRole: userRole || 'picker',
    });

    if (
      order.bagId &&
      order.bagId.length > 0 &&
      order.rackLocation &&
      order.rackLocation.length > 0
    ) {
      order.status = ORDER_STATUS.READY_FOR_DISPATCH;
      order.timeline.push({
        status: ORDER_STATUS.READY_FOR_DISPATCH,
        timestamp: now,
        updatedBy: userId,
        updatedByRole: userRole || 'picker',
      });
    }

    order.version = (order.version || 0) + 1;
    await order.save();
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('darkstore:*');

    const pickerId = order.pickerAssignment?.pickerId || order.assignee?.id || userId;
    if (pickerId) {
      logPickerAction({
        actionType: 'bag_rack_assigned',
        pickerId: String(pickerId),
        orderId,
        metadata: { bagId: order.bagId, rackLocation: order.rackLocation },
      }).catch(() => {});
    }

    try {
      const event = {
        order_id: orderId,
        store_id: order.store_id,
        status: order.status,
        bagId: order.bagId,
        rackLocation: order.rackLocation,
        readyForDispatch: !!(order.bagId && order.rackLocation),
        updated_at: now,
      };
      websocketService?.broadcastToRole?.('darkstore', 'order:updated', event);
      websocketService?.broadcastToRole?.('admin', 'order:updated', event);
      websocketService?.broadcast?.('order:updated', event);
    } catch (e) {
      /* non-blocking */
    }

    res.status(200).json({
      success: true,
      order_id: orderId,
      bagId: order.bagId,
      rackLocation: order.rackLocation,
      status: order.status,
      readyForDispatch: !!(order.bagId && order.rackLocation),
      message: `Bag/Rack updated for order ${orderId}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update bag/rack',
    });
  }
}

module.exports = { updateBagRack };
