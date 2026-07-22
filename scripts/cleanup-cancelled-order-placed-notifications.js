/**
 * One-time / manual cleanup: remove stale placement/confirmation notifications
 * ("Order Placed", "Order Confirmed", "Awaiting Payment", ...) that belong to
 * orders which were later cancelled. A cancelled order's inbox must show ONLY
 * "Order Cancelled".
 *
 * Usage:
 *   node scripts/cleanup-cancelled-order-placed-notifications.js --dry-run
 *   node scripts/cleanup-cancelled-order-placed-notifications.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Order } = require('../src/customer-backend/models/Order');
const { Notification } = require('../src/customer-backend/models/Notification');
const { PLACEMENT_NOTIFICATION_TYPES } = require('../src/customer-backend/services/notificationService');

const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK_SIZE = 500;

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

  await connectDB();
  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY RUN — nothing will be deleted)' : ''}`);

  const cancelledOrders = await Order.find({ status: 'cancelled' }).select('_id').lean();
  const cancelledIds = cancelledOrders.map((o) => String(o._id));
  console.log(`Cancelled orders found: ${cancelledIds.length}`);

  let totalMatched = 0;
  let totalDeleted = 0;

  for (let i = 0; i < cancelledIds.length; i += CHUNK_SIZE) {
    const chunk = cancelledIds.slice(i, i + CHUNK_SIZE);
    const filter = {
      'data.orderId': { $in: chunk },
      'data.type': { $in: PLACEMENT_NOTIFICATION_TYPES },
    };

    if (DRY_RUN) {
      const matches = await Notification.find(filter)
        .select('userId title body data.orderId data.type createdAt')
        .lean();
      totalMatched += matches.length;
      for (const n of matches) {
        console.log(
          `  [would delete] order=${n.data?.orderId} type=${n.data?.type} title="${n.title}" createdAt=${n.createdAt?.toISOString?.() || n.createdAt}`
        );
      }
    } else {
      const result = await Notification.deleteMany(filter);
      totalDeleted += result.deletedCount || 0;
    }
  }

  if (DRY_RUN) {
    console.log(`Dry run complete. Stale placement notifications matched: ${totalMatched}`);
  } else {
    console.log(`Deleted stale placement notifications: ${totalDeleted}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0); // db.js pool monitoring interval would otherwise keep the process alive
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
