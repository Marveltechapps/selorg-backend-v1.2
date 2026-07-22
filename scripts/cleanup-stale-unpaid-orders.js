/**
 * One-shot: void abandoned online checkouts that still sit as
 * pending + unpaid (with or without an expired Worldline session).
 * These were incorrectly returned by GET /orders/active as "Payment Pending".
 *
 * Usage:
 *   node scripts/cleanup-stale-unpaid-orders.js
 *   node scripts/cleanup-stale-unpaid-orders.js --dry-run
 *   node scripts/cleanup-stale-unpaid-orders.js --order ORD-20260721-00211
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const DRY_RUN = process.argv.includes('--dry-run');
const orderArgIdx = process.argv.indexOf('--order');
const ONLY_ORDER = orderArgIdx >= 0 ? String(process.argv[orderArgIdx + 1] || '').trim() : '';

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing');
    process.exit(1);
  }

  await connectDB();
  const { Order } = require('../src/customer-backend/models/Order');
  const { WorldlinePayment } = require('../src/customer-backend/models/WorldlinePayment');
  const { voidUnpaidOnlineOrder } = require('../src/customer-backend/services/orderService');

  const ttlMinutes = parseInt(process.env.PENDING_PAYMENT_TTL_MINUTES || '30', 10);
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

  const query = {
    status: 'pending',
    paymentStatus: { $ne: 'paid' },
    'paymentMethod.methodType': { $in: ['card', 'upi', 'digital'] },
    fulfillmentReleased: { $ne: true },
    createdAt: { $lte: cutoff },
  };
  if (ONLY_ORDER) {
    query.orderNumber = ONLY_ORDER;
    delete query.createdAt;
  }

  const candidates = await Order.find(query).sort({ createdAt: 1 }).limit(200).lean();
  console.log(`Found ${candidates.length} stale unpaid online order(s)${DRY_RUN ? ' (dry-run)' : ''}`);

  let voided = 0;
  let skipped = 0;

  for (const o of candidates) {
    const latest = await WorldlinePayment.findOne({
      orderId: o._id,
      standaloneCheckout: { $ne: true },
    })
      .sort({ attemptNo: -1 })
      .lean();

    const sessionExpired =
      latest?.sessionExpiresAt && new Date(latest.sessionExpiresAt).getTime() < Date.now();
    const nonTerminal = latest && !['success', 'failed', 'cancelled'].includes(latest.status);
    const noAttempt = !latest;
    const alreadyFailedAttempt =
      latest && (latest.status === 'failed' || latest.status === 'cancelled' || latest.status === 'unknown');
    const abandonedSession =
      nonTerminal &&
      (latest.status === 'created' || latest.status === 'initiated' || latest.status === 'unknown') &&
      (sessionExpired || !latest.sessionExpiresAt);
    const extremelyStale =
      nonTerminal &&
      Date.now() - new Date(latest.createdAt || latest.updatedAt || 0).getTime() > 24 * 60 * 60 * 1000;

    // Order still pending+unpaid while payment row is already terminal/stale → void.
    const shouldVoid =
      noAttempt || alreadyFailedAttempt || abandonedSession || extremelyStale || Boolean(ONLY_ORDER);
    if (!shouldVoid) {
      console.log(`SKIP ${o.orderNumber} — live/pending gateway attempt (${latest?.status})`);
      skipped += 1;
      continue;
    }

    console.log(
      `${DRY_RUN ? 'WOULD VOID' : 'VOID'} ${o.orderNumber} id=${o._id} ageMin=${Math.round(
        (Date.now() - new Date(o.createdAt).getTime()) / 60000
      )} attempt=${latest ? latest.status : 'none'}`
    );

    if (DRY_RUN) {
      voided += 1;
      continue;
    }

    if (latest && nonTerminal) {
      await WorldlinePayment.updateOne(
        { _id: latest._id, status: latest.status },
        {
          $set: {
            status: 'failed',
            statusMessage: 'Payment session expired without completion',
            verificationSource: 'reconciliation',
          },
        }
      );
    }

    const result = await voidUnpaidOnlineOrder(
      String(o.userId),
      String(o._id),
      'Payment was not completed in time',
      'timeout'
    );
    if (result?.error) {
      console.warn(`  error: ${result.error}`);
      skipped += 1;
    } else {
      voided += 1;
    }
  }

  console.log(`Done. voided=${voided} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
