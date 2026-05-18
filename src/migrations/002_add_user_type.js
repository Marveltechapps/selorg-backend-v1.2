/**
 * Migration 002: Add userType field to users
 * File: src/migrations/002_add_user_type.js
 *
 * P2.2: Backfills userType field based on existing data structure
 */

const logger = require('../core/utils/logger');

/**
 * Determine user type based on existing fields
 */
const determineUserType = (user) => {
  // Check for service-specific fields
  if (user.pickerInfo) {
    return 'PICKER';
  }

  if (user.riderInfo) {
    return 'RIDER';
  }

  if (user.customerInfo) {
    return 'CUSTOMER';
  }

  // Check role field if exists
  if (user.role) {
    const roleMap = { picker: 'PICKER', rider: 'RIDER', customer: 'CUSTOMER', admin: 'ADMIN' };
    return roleMap[user.role.toLowerCase()] || 'CUSTOMER';
  }

  // Default to CUSTOMER
  return 'CUSTOMER';
};

/**
 * Run migration
 */
const migrate = async (db) => {
  try {
    const usersCollection = db.collection('users');

    logger.info('[Migration 002] Starting: Add userType to users');

    // Get all users without userType
    const usersWithoutType = await usersCollection
      .find({ userType: { $exists: false } })
      .toArray();

    logger.info(`[Migration 002] Found ${usersWithoutType.length} users without userType`);

    // Update each user
    for (const user of usersWithoutType) {
      const userType = determineUserType(user);
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { userType, updatedAt: new Date() } }
      );
    }

    logger.info(`[Migration 002] Successfully backfilled ${usersWithoutType.length} users`);

    return {
      success: true,
      message: `Backfilled ${usersWithoutType.length} users with userType`
    };
  } catch (error) {
    logger.error('[Migration 002] Failed:', error);
    throw error;
  }
};

/**
 * Rollback migration
 */
const rollback = async (db) => {
  try {
    const usersCollection = db.collection('users');

    logger.info('[Migration 002] Rolling back: Remove userType from users');

    await usersCollection.updateMany({}, { $unset: { userType: '' } });

    logger.info('[Migration 002] Rollback complete');

    return { success: true, message: 'Rollback successful' };
  } catch (error) {
    logger.error('[Migration 002] Rollback failed:', error);
    throw error;
  }
};

module.exports = {
  name: '002_add_user_type',
  migrate,
  rollback
};
