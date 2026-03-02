/**
 * Not Found Impact Service
 * Handles downstream effects when picker marks item "not found" in HHD app:
 * - Flag order line for refund (create RefundRequest)
 * - Decrement stock in Darkstore/HHD inventory
 * - Emit event for catalog sync (customer-facing availability)
 */
const RefundRequest = require('../../finance/models/RefundRequest');
const HHDInventory = require('../models/Inventory.model');
const websocketService = require('../../utils/websocket');
const logger = require('../../core/utils/logger');

const INVENTORY_STATUS = { AVAILABLE: 'available' };

async function createRefundForItemNotFound(orderId, sku, notes) {
  try {
    const refund = await RefundRequest.create({
      orderId,
      customerId: orderId,
      customerName: 'Customer',
      customerEmail: `refund-${orderId}@ops.selorg`,
      reasonCode: 'other',
      reasonText: notes || `Item ${sku} marked not found by picker`,
      amount: 0,
      currency: 'INR',
      status: 'pending',
      channel: 'ops_adjustment',
      notes: `Auto-created from picker not-found report. SKU: ${sku}`,
    });
    logger.info('Refund request created for not-found item', { orderId, sku, refundId: refund._id });
    return refund;
  } catch (err) {
    logger.error('Failed to create refund for not-found item', { orderId, sku, error: err.message });
    throw err;
  }
}

async function decrementHHDInventory(sku, binId = null) {
  try {
    const filter = { sku, status: INVENTORY_STATUS.AVAILABLE, quantity: { $gt: 0 } };
    if (binId) filter.binId = binId;

    const inv = await HHDInventory.findOne(filter).sort({ quantity: -1 });
    if (!inv) {
      logger.warn('No HHD inventory found to decrement for not-found item', { sku, binId });
      return null;
    }

    await HHDInventory.updateOne(
      { _id: inv._id },
      { $inc: { quantity: -1 } }
    );
    logger.info('HHD inventory decremented for not-found item', { sku, binId: inv.binId });
    return inv;
  } catch (err) {
    logger.error('Failed to decrement HHD inventory for not-found item', { sku, binId, error: err.message });
    throw err;
  }
}

function emitCatalogSyncEvent(sku) {
  try {
    if (websocketService.isInitialized()) {
      websocketService.broadcast('catalog:availability_changed', {
        sku,
        reason: 'item_not_found',
        timestamp: new Date().toISOString(),
      });
      logger.debug('Catalog sync event emitted for not-found item', { sku });
    }
  } catch (err) {
    logger.warn('Failed to emit catalog sync event (non-fatal)', { sku, error: err.message });
  }
}

/**
 * Apply all downstream effects when item is marked not found
 * @param {Object} params
 * @param {string} params.orderId - Order ID
 * @param {string} params.sku - SKU/itemCode
 * @param {string} [params.binId] - Bin ID (optional, for reportIssue flow)
 * @param {string} [params.notes] - Optional notes
 * @param {boolean} [params.skipInventoryDecrement] - If true, skip inventory decrement (e.g. already done by reportIssue)
 */
async function applyNotFoundImpact({ orderId, sku, binId = null, notes, skipInventoryDecrement = false }) {
  const results = { refund: null, inventory: null };
  try {
    await createRefundForItemNotFound(orderId, sku, notes);
    results.refund = true;
  } catch (err) {
    results.refundError = err.message;
  }

  if (!skipInventoryDecrement) {
    try {
      results.inventory = await decrementHHDInventory(sku, binId);
    } catch (err) {
      results.inventoryError = err.message;
    }
  }

  emitCatalogSyncEvent(sku);
  return results;
}

module.exports = {
  applyNotFoundImpact,
  createRefundForItemNotFound,
  decrementHHDInventory,
  emitCatalogSyncEvent,
};
