/**
 * Syncs HHD/Picker order status updates to darkstore Order when both systems
 * refer to the same order (matching order_id). Uses best-effort pattern so
 * the primary HHD flow never fails.
 *
 * HHD ORDER_STATUS: PENDING, RECEIVED, BAG_SCANNED, PICKING, COMPLETED, ...
 * Darkstore/Workforce ORDER_STATUS: ASSIGNED, PICKING, PICKED, PACKED, READY_FOR_DISPATCH, CANCELLED
 */
const DarkstoreOrder = require('../../darkstore/models/Order');
const { Order: CustomerOrder } = require('../../customer-backend/models/Order');
const { triggerAutoRefundForMissingItems } = require('../../customer-backend/services/autoRefundService');
const { ORDER_STATUS } = require('../../constants/pickerEnums');
const cache = require('../../utils/cache');

async function syncStatusToDarkstore(orderId, hhdStatus, payload = {}) {
  try {
    const order = await DarkstoreOrder.findOne({ order_id: orderId });
    if (!order) return;

    const now = new Date();
    order.timeline = order.timeline || [];
    order.version = (order.version || 0) + 1;

    if (hhdStatus === 'picking' || hhdStatus === 'PICKING') {
      order.status = ORDER_STATUS.PICKING;
      order.pickingData = order.pickingData || {};
      order.pickingData.startTime = order.pickingData.startTime || now;
      order.timeline.push({
        status: ORDER_STATUS.PICKING,
        timestamp: now,
        updatedBy: payload.pickerId || '',
        updatedByRole: 'picker',
      });
    } else if (hhdStatus === 'completed' || hhdStatus === 'COMPLETED') {
      order.status = ORDER_STATUS.PICKED;
      order.pickingData = order.pickingData || {};
      order.pickingData.endTime = now;
      if (payload.pickTime != null) order.pickingData.pickDuration = payload.pickTime;
      if (Array.isArray(payload.missingItems) && payload.missingItems.length > 0) {
        order.pickingData.missingItems = payload.missingItems;
      }
      order.timeline.push({
        status: ORDER_STATUS.PICKED,
        timestamp: now,
        updatedBy: payload.pickerId || '',
        updatedByRole: 'picker',
      });
    }

    if (payload.bagId) order.bagId = payload.bagId;
    if (payload.rackLocation) order.rackLocation = payload.rackLocation;

    await order.save();
    try {
      await cache.delByPattern('dashboard:*');
      await cache.delByPattern('darkstore:*');
    } catch (_) { /* non-blocking */ }

    const missingForRefund = (order.pickingData?.missingItems || []).filter(
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
          await triggerAutoRefundForMissingItems(customerOrder._id, missingItemsForAutoRefund);
        }
      } catch (refundErr) {
        console.warn('darkstoreOrderSyncService: refund trigger failed (non-blocking)', { orderId, error: refundErr.message });
      }
    }
  } catch (err) {
    console.warn('darkstoreOrderSyncService: sync failed (non-blocking)', { orderId, hhdStatus, error: err.message });
  }
}

module.exports = { syncStatusToDarkstore };
