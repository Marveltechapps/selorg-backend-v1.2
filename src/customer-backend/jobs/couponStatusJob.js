const { PricingCoupon: Coupon } = require('../../merch/models/PricingCoupon');
const logger = require('../../core/utils/logger');

/**
 * Coupon Status Management Job
 * Automatically activates scheduled coupons and expires active ones.
 * Should be run every 60 seconds.
 */
async function processCouponStatusUpdates() {
  const now = new Date();
  
  try {
    // Activate scheduled coupons
    // We assume 'scheduled' is another status we might use. 
    // If not explicitly defined, we check 'active' status but where start date just reached.
    // The user's request mentions 'SCHEDULED' status.
    const activated = await Coupon.updateMany(
      { 
        status: { $in: ['scheduled', 'SCHEDULED'] }, 
        startDate: { $lte: now } 
      },
      { $set: { status: 'active', isActive: true } }
    );
    
    if (activated.modifiedCount > 0) {
      logger.info(`[couponStatusJob] Activated ${activated.modifiedCount} scheduled coupons`);
    }

    // Expire coupons past their end date
    const expired = await Coupon.updateMany(
      { 
        status: { $in: ['active', 'ACTIVE'] }, 
        endDate: { $ne: null, $lte: now } 
      },
      { $set: { status: 'expired', isActive: false } }
    );

    if (expired.modifiedCount > 0) {
      logger.info(`[couponStatusJob] Expired ${expired.modifiedCount} active coupons`);
    }
  } catch (err) {
    logger.error('[couponStatusJob] Update failed:', err?.message);
  }
}

/**
 * Run the full status update check
 */
async function run() {
  try {
    await processCouponStatusUpdates();
  } catch (err) {
    logger.error('[couponStatusJob] Run failed:', err?.message);
  }
}

/**
 * Start the job on an interval (default: every 60 seconds)
 */
function start(intervalMs = 60 * 1000) {
  run(); // Run immediately
  return setInterval(run, intervalMs);
}

module.exports = { run, start };
