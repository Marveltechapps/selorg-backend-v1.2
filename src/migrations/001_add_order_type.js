/**
 * Migration 001: Add orderType field to orders
 * File: src/migrations/001_add_order_type.js
 *
 * P2.2: Backfills orderType field based on existing data structure
 */

const logger = require('../core/utils/logger');

/**
 * Determine order type based on existing fields
 */
const determineOrderType = (order) => {
  // If has customerId and deliveryLocation, likely CUSTOMER_ORDER
  if (order.customerId && order.deliveryLocation) {
    return 'CUSTOMER_ORDER';
  }

  // If has pickerId, likely PICKER_ORDER
  if (order.pickerId) {
    return 'PICKER_ORDER';
  }

  // If has riderId, likely RIDER_ORDER
  if (order.riderId) {
    return 'RIDER_ORDER';
  }

  // Default to CUSTOMER_ORDER
  return 'CUSTOMER_ORDER';
};

/**
 * Run migration
 */
const migrate = async (db) => {
  try {
    const ordersCollection = db.collection('orders');

    logger.info('[Migration 001] Starting: Add orderType to orders');

    // Get all orders without orderType
    const ordersWithoutType = await ordersCollection
      .find({ orderType: { $exists: false } })
      .toArray();

    logger.info(`[Migration 001] Found ${ordersWithoutType.length} orders without orderType`);

    // Update each order
    for (const order of ordersWithoutType) {
      const orderType = determineOrderType(order);
      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: { orderType, updatedAt: new Date() } }
      );
    }

    logger.info(`[Migration 001] Successfully backfilled ${ordersWithoutType.length} orders`);

    return {
      success: true,
      message: `Backfilled ${ordersWithoutType.length} orders with orderType`
    };
  } catch (error) {
    logger.error('[Migration 001] Failed:', error);
    throw error;
  }
};

/**
 * Rollback migration
 */
const rollback = async (db) => {
  try {
    const ordersCollection = db.collection('orders');

    logger.info('[Migration 001] Rolling back: Remove orderType from orders');

    await ordersCollection.updateMany({}, { $unset: { orderType: '' } });

    logger.info('[Migration 001] Rollback complete');

    return { success: true, message: 'Rollback successful' };
  } catch (error) {
    logger.error('[Migration 001] Rollback failed:', error);
    throw error;
  }
};

module.exports = {
  name: '001_add_order_type',
  migrate,
  rollback
};
