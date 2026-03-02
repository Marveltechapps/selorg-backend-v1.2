/**
 * Production → Warehouse Integration Service
 * When a production run (WorkOrder) completes, creates inventory adjustment to add
 * finished goods to warehouse/darkstore so they become available for customer orders.
 */
const InventoryItem = require('../../production/models/InventoryItem');
const InventoryAdjustment = require('../../production/models/InventoryAdjustment');
const AuditLog = require('../../production/models/AuditLog');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
const REASON_CODE = 'production_output';

/**
 * Resolve product name or SKU to an InventoryItem
 * @param {string} product - Product name or SKU from WorkOrder
 * @param {string} storeId - Store/warehouse ID
 * @returns {Object|null} InventoryItem or null
 */
async function resolveProductToInventoryItem(product, storeId) {
  if (!product || typeof product !== 'string') return null;
  const trimmed = product.trim();
  if (!trimmed) return null;

  // Try SKU first (exact match)
  let item = await InventoryItem.findOne({ sku: trimmed, store_id: storeId }).lean();
  if (item) return item;

  // Try name (case-insensitive)
  item = await InventoryItem.findOne({
    name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    store_id: storeId,
  }).lean();
  if (item) return item;

  // Try partial name match
  item = await InventoryItem.findOne({
    store_id: storeId,
    $or: [
      { name: { $regex: trimmed, $options: 'i' } },
      { sku: { $regex: trimmed, $options: 'i' } },
    ],
  }).lean();
  return item;
}

/**
 * Create inventory adjustment to add finished goods to warehouse
 * @param {Object} params
 * @param {string} params.sku - SKU of the item
 * @param {number} params.quantity - Quantity to add
 * @param {string} [params.storeId] - Store/warehouse ID
 * @param {string} [params.workOrderId] - Source work order ID for audit
 * @param {string} [params.workOrderNumber] - Work order number for audit
 * @param {string} [params.user] - User/system identifier
 * @returns {Object} { success, adjustmentId, newStock, error? }
 */
async function createInventoryAdjustmentForProduction({
  sku,
  quantity,
  storeId = DEFAULT_STORE_ID,
  workOrderId,
  workOrderNumber,
  user = 'system',
}) {
  if (!sku || quantity == null || quantity <= 0) {
    return { success: false, error: 'sku and positive quantity are required' };
  }

  try {
    const item = await InventoryItem.findOne({ sku, store_id: storeId });
    if (!item) {
      return { success: false, error: `Inventory item not found: ${sku} for store ${storeId}` };
    }

    const oldStock = item.stock ?? 0;
    const newStock = oldStock + Number(quantity);
    item.stock = newStock;
    await item.save();

    const adjustmentId = generateId('ADJ');
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const reason = workOrderNumber
      ? `Production output from work order ${workOrderNumber}`
      : 'Production output - finished goods';

    await InventoryAdjustment.create({
      id: adjustmentId,
      adjustment_id: adjustmentId,
      time: timeString,
      sku,
      action: 'add',
      quantity: Number(quantity),
      user,
      reason,
      store_id: storeId,
      mode: 'add',
      reason_code: REASON_CODE,
      notes: workOrderId ? `WorkOrder: ${workOrderId}` : undefined,
      new_stock: newStock,
    });

    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: now.toISOString(),
      action_type: 'adjustment',
      action: 'PRODUCTION_TO_WAREHOUSE',
      user,
      sku,
      details: {
        mode: 'add',
        quantity: Number(quantity),
        reason_code: REASON_CODE,
        work_order_id: workOrderId,
        work_order_number: workOrderNumber,
      },
      changes: { stock_before: oldStock, stock_after: newStock },
      store_id: storeId,
    });

    return { success: true, adjustmentId, newStock };
  } catch (err) {
    logger.error('createInventoryAdjustmentForProduction failed', { sku, quantity, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Handle production run completion: create warehouse inventory adjustment for finished goods
 * @param {Object} workOrder - Completed WorkOrder document { product, quantity, _id, orderNumber }
 * @param {Object} [options]
 * @param {string} [options.storeId] - Target store/warehouse ID
 * @param {string} [options.user] - User identifier
 * @returns {Object} { success, adjustments: [], errors: [] }
 */
async function onProductionRunComplete(workOrder, options = {}) {
  const storeId = options.storeId || DEFAULT_STORE_ID;
  const user = options.user || 'system';
  const product = workOrder?.product;
  const quantity = workOrder?.quantity;
  const workOrderId = workOrder?._id?.toString?.();
  const workOrderNumber = workOrder?.orderNumber;

  const result = { success: false, adjustments: [], errors: [] };

  if (!product || quantity == null || quantity <= 0) {
    result.errors.push('Work order must have product and positive quantity');
    return result;
  }

  const item = await resolveProductToInventoryItem(product, storeId);
  if (!item) {
    logger.warn('Production to warehouse: product not found in inventory', {
      product,
      storeId,
      workOrderNumber,
    });
    result.errors.push(`Product "${product}" not found in warehouse inventory (store: ${storeId}). Add it to catalog first or ensure product name/SKU matches.`);
    return result;
  }

  const adjResult = await createInventoryAdjustmentForProduction({
    sku: item.sku,
    quantity: Number(quantity),
    storeId,
    workOrderId,
    workOrderNumber,
    user,
  });

  if (adjResult.success) {
    result.success = true;
    result.adjustments.push({
      sku: item.sku,
      quantity: Number(quantity),
      adjustmentId: adjResult.adjustmentId,
      newStock: adjResult.newStock,
    });
    logger.info('Production to warehouse: inventory adjustment created', {
      sku: item.sku,
      quantity,
      adjustmentId: adjResult.adjustmentId,
      workOrderNumber,
    });
  } else {
    result.errors.push(adjResult.error || 'Failed to create adjustment');
  }

  return result;
}

module.exports = {
  onProductionRunComplete,
  createInventoryAdjustmentForProduction,
  resolveProductToInventoryItem,
};
