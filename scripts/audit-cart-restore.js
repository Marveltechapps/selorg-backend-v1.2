/**
 * Read-only audit for the "extra product appears in cart after login" bug.
 * Counts cancelled unpaid gateway orders that were repeatedly restoring carts,
 * and checks customer_carts for duplicate lines. Makes NO writes.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const orders = db.collection('customer_orders');
  const carts = db.collection('customer_carts');

  const replayCandidates = await orders.countDocuments({
    status: 'cancelled',
    fulfillmentReleased: { $ne: true },
    'paymentMethod.methodType': { $in: ['card', 'upi', 'digital'] },
  });

  const usersAffected = await orders.distinct('userId', {
    status: 'cancelled',
    fulfillmentReleased: { $ne: true },
    'paymentMethod.methodType': { $in: ['card', 'upi', 'digital'] },
  });

  const cartCount = await carts.countDocuments({});
  const cartsWithItems = await carts.countDocuments({ 'items.0': { $exists: true } });

  // Duplicate lines inside a single cart (same productId + variantId).
  const dupCarts = await carts
    .aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: { userId: '$userId', pid: '$items.productId', vid: '$items.variantId' },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
      { $group: { _id: '$_id.userId' } },
      { $count: 'carts' },
    ])
    .toArray();

  // Multiple cart documents per user (unique index should prevent this).
  const multiDocUsers = await carts
    .aggregate([
      { $group: { _id: '$userId', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $count: 'users' },
    ])
    .toArray();

  console.log(JSON.stringify({
    cancelledUnpaidGatewayOrders_replayCandidates: replayCandidates,
    distinctUsersAffectedByReplay: usersAffected.length,
    totalCartDocs: cartCount,
    cartsWithItems,
    cartsWithDuplicateLines: dupCarts[0]?.carts ?? 0,
    usersWithMultipleCartDocs: multiDocUsers[0]?.users ?? 0,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
