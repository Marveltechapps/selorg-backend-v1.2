/**
 * Cancel/unassign open rider orders that look like leftover test data.
 * Usage: node scripts/clear-rider-open-orders.js [riderId]
 */
require('dotenv').config();
const mongoose = require('mongoose');

const riderId = process.argv[2] || 'RDR-ADY-2604-004';
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  if (!uri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    family: 4,
    serverSelectionTimeoutMS: 30000,
  });

  const col = mongoose.connection.db.collection('orders');
  // Rider v2 Order model typically uses collection "orders"
  const collections = await mongoose.connection.db.listCollections().toArray();
  const orderColNames = collections.map((c) => c.name).filter((n) => /^orders?$/i.test(n) || /rider.*order/i.test(n));
  console.log('Candidate collections:', orderColNames);

  const targets = orderColNames.length ? orderColNames : ['orders'];
  let total = 0;

  for (const name of targets) {
    const c = mongoose.connection.db.collection(name);
    const openFilter = {
      'riderAssignment.riderId': riderId,
      status: { $nin: ['delivered', 'cancelled', 'returned'] },
    };
    const before = await c.find(openFilter).project({ orderNumber: 1, status: 1, _id: 1 }).toArray();
    console.log(`\n[${name}] open orders for ${riderId}:`, before.length);
    before.forEach((o) => console.log(' -', o._id.toString(), o.orderNumber, o.status));

    if (!before.length) continue;

    const result = await c.updateMany(openFilter, {
      $set: {
        status: 'cancelled',
        updatedAt: new Date(),
        'riderAssignment.rejectedAt': new Date(),
        'metadata.cancelReason': 'cleared_test_open_orders',
      },
    });
    console.log(`[${name}] cancelled:`, result.modifiedCount);
    total += result.modifiedCount;
  }

  // Also clear rider cache keys if redis not required — Order list uses in-memory/redis cache
  console.log('\nDone. Cancelled', total, 'open order(s) for', riderId);
  console.log('Reload Live Orders in the app (pull to refresh).');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
