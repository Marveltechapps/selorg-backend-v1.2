/**
 * One-time / manual cleanup: remove duplicate payment-outcome notifications
 * ("Payment Cancelled", "Payment Failed", "Payment Session Expired",
 * "Order Placed") that were created by concurrent payment handlers before the
 * idempotency fix. For each (userId, orderId, type) group the EARLIEST record
 * is kept; the later duplicates are deleted.
 *
 * Also backfills `dedupeKey` on the surviving record and syncs the unique
 * partial index so future duplicates are impossible at the database level.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-payment-notifications.js --dry-run
 *   node scripts/cleanup-duplicate-payment-notifications.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Notification } = require('../src/customer-backend/models/Notification');

const DRY_RUN = process.argv.includes('--dry-run');

const PAYMENT_OUTCOME_TYPES = [
  'PAYMENT_CANCELLED',
  'PAYMENT_FAILED',
  'PAYMENT_TIMEOUT',
  'ORDER_PLACED',
];

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

  await connectDB();
  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY RUN — nothing will be modified)' : ''}`);

  const groups = await Notification.aggregate([
    {
      $match: {
        'data.type': { $in: PAYMENT_OUTCOME_TYPES },
        'data.orderId': { $exists: true, $ne: '' },
      },
    },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: { userId: '$userId', orderId: '$data.orderId', type: '$data.type' },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
  ]);

  let duplicateGroups = 0;
  let totalDeleted = 0;
  let totalBackfilled = 0;

  for (const group of groups) {
    const [keepId, ...duplicateIds] = group.ids;
    const dedupeKey = `payment-outcome:${group._id.orderId}:${group._id.type}`;

    if (duplicateIds.length > 0) {
      duplicateGroups += 1;
      if (DRY_RUN) {
        console.log(
          `  [would delete ${duplicateIds.length}] order=${group._id.orderId} type=${group._id.type} keep=${keepId}`
        );
        totalDeleted += duplicateIds.length;
      } else {
        const result = await Notification.deleteMany({ _id: { $in: duplicateIds } });
        totalDeleted += result.deletedCount || 0;
      }
    }

    if (!DRY_RUN) {
      // Backfill the dedupe key on the survivor so the unique index protects
      // this (orderId, type) pair from any future replay.
      try {
        const res = await Notification.updateOne(
          { _id: keepId, dedupeKey: null },
          { $set: { dedupeKey } }
        );
        if (res.modifiedCount === 1) totalBackfilled += 1;
      } catch (err) {
        // Duplicate dedupeKey would mean the survivor was already keyed — fine.
        if (!String(err.message || '').includes('E11000')) throw err;
      }
    }
  }

  if (!DRY_RUN) {
    console.log('Syncing indexes (unique partial index on dedupeKey)...');
    await Notification.syncIndexes();
  }

  console.log(
    DRY_RUN
      ? `Dry run complete. Duplicate groups: ${duplicateGroups}, notifications that would be deleted: ${totalDeleted}`
      : `Done. Duplicate groups: ${duplicateGroups}, deleted: ${totalDeleted}, dedupeKey backfilled: ${totalBackfilled}`
  );

  await mongoose.disconnect();
  process.exit(0); // db.js pool monitoring interval would otherwise keep the process alive
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
