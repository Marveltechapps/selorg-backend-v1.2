/**
 * Migration 003: Create indexes on type fields
 * File: src/migrations/003_create_type_indexes.js
 *
 * P2.2: Creates performance indexes on type discriminator fields
 */

const logger = require('../core/utils/logger');

/**
 * Run migration
 */
const migrate = async (db) => {
  try {
    logger.info('[Migration 003] Starting: Create type indexes');

    // Orders collection indexes
    const ordersCollection = db.collection('orders');
    const orderIndexes = [
      { key: { orderType: 1 } },
      { key: { orderType: 1, status: 1, createdAt: -1 } },
      { key: { orderType: 1, customerId: 1 } }
    ];

    for (const indexSpec of orderIndexes) {
      await ordersCollection.createIndex(indexSpec.key);
      logger.info(`[Migration 003] Created index on orders: ${JSON.stringify(indexSpec.key)}`);
    }

    // Users collection indexes
    const usersCollection = db.collection('users');
    const userIndexes = [
      { key: { userType: 1 } },
      { key: { userType: 1, isActive: 1 } },
      { key: { email: 1, userType: 1 }, options: { unique: true } }
    ];

    for (const indexSpec of userIndexes) {
      await usersCollection.createIndex(indexSpec.key, indexSpec.options || {});
      logger.info(`[Migration 003] Created index on users: ${JSON.stringify(indexSpec.key)}`);
    }

    // Shifts collection indexes
    const shiftsCollection = db.collection('shifts');
    const shiftIndexes = [
      { key: { shiftType: 1 } },
      { key: { userId: 1, shiftType: 1, startTime: -1 } },
      { key: { status: 1, endTime: 1 } }
    ];

    for (const indexSpec of shiftIndexes) {
      await shiftsCollection.createIndex(indexSpec.key);
      logger.info(`[Migration 003] Created index on shifts: ${JSON.stringify(indexSpec.key)}`);
    }

    logger.info('[Migration 003] Successfully created all indexes');

    return {
      success: true,
      message: 'Created performance indexes on type fields'
    };
  } catch (error) {
    logger.error('[Migration 003] Failed:', error);
    throw error;
  }
};

/**
 * Rollback migration
 */
const rollback = async (db) => {
  try {
    logger.info('[Migration 003] Rolling back: Drop type indexes');

    const collections = ['orders', 'users', 'shifts'];

    for (const collName of collections) {
      const collection = db.collection(collName);
      const indexes = await collection.indexes();

      // Drop all indexes except _id
      for (const index of indexes) {
        if (index.name !== '_id_') {
          await collection.dropIndex(index.name);
          logger.info(`[Migration 003] Dropped index: ${index.name}`);
        }
      }
    }

    logger.info('[Migration 003] Rollback complete');

    return { success: true, message: 'Rollback successful' };
  } catch (error) {
    logger.error('[Migration 003] Rollback failed:', error);
    throw error;
  }
};

module.exports = {
  name: '003_create_type_indexes',
  migrate,
  rollback
};
