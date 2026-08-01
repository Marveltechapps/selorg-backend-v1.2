/**
 * Clear pending HHD / assignorders documents from MongoDB.
 * Pending orders in the HHD app come only from these collections —
 * there is no API fallback. Stale test/demo rows must be deleted here.
 *
 * Usage:
 *   node scripts/clear-hhd-pending-orders.js
 *   node scripts/clear-hhd-pending-orders.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Reuse backend DB connect (includes Windows DNS / SRV workaround).
  await connectDB();
  const db = mongoose.connection.db;

  const hhdOrders = db.collection('hhd_orders');
  const assignOrders = db.collection('assignorders');
  const hhdItems = db.collection('hhd_items');

  const pendingFilter = { status: 'pending' };

  const pendingHhd = await hhdOrders
    .find(pendingFilter)
    .project({ orderId: 1, zone: 1, targetTime: 1, itemCount: 1, userId: 1 })
    .toArray();
  const pendingAssign = await assignOrders
    .find(pendingFilter)
    .project({ orderId: 1, zone: 1, itemCount: 1, userId: 1 })
    .toArray();

  console.log(`[clear-hhd-pending] Found ${pendingHhd.length} pending hhd_orders`);
  console.log(`[clear-hhd-pending] Found ${pendingAssign.length} pending assignorders`);

  if (pendingHhd.length) {
    console.log(
      '  Sample hhd_orders:',
      pendingHhd
        .slice(0, 8)
        .map((o) => o.orderId)
        .join(', ')
    );
  }
  if (pendingAssign.length) {
    console.log(
      '  Sample assignorders:',
      pendingAssign
        .slice(0, 8)
        .map((o) => o.orderId)
        .join(', ')
    );
  }

  if (DRY_RUN) {
    console.log('[clear-hhd-pending] Dry run — no deletes performed.');
    await mongoose.disconnect();
    return;
  }

  const orderIds = [
    ...new Set([
      ...pendingHhd.map((o) => o.orderId).filter(Boolean),
      ...pendingAssign.map((o) => o.orderId).filter(Boolean),
    ]),
  ];

  const hhdResult = await hhdOrders.deleteMany(pendingFilter);
  const assignResult = await assignOrders.deleteMany(pendingFilter);
  let itemsDeleted = 0;
  if (orderIds.length > 0) {
    const itemsResult = await hhdItems.deleteMany({ orderId: { $in: orderIds } });
    itemsDeleted = itemsResult.deletedCount || 0;
  }

  console.log(`[clear-hhd-pending] Deleted ${hhdResult.deletedCount} hhd_orders (pending)`);
  console.log(`[clear-hhd-pending] Deleted ${assignResult.deletedCount} assignorders (pending)`);
  console.log(`[clear-hhd-pending] Deleted ${itemsDeleted} related hhd_items`);

  const remainingHhd = await hhdOrders.countDocuments(pendingFilter);
  const remainingAssign = await assignOrders.countDocuments(pendingFilter);
  console.log(`[clear-hhd-pending] Remaining pending hhd_orders: ${remainingHhd}`);
  console.log(`[clear-hhd-pending] Remaining pending assignorders: ${remainingAssign}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[clear-hhd-pending] Failed:', err.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
