const logger = require('../../core/utils/logger');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const { Order } = require('../models/Order');
const { voidUnpaidOnlineOrder } = require('../services/orderService');

function isEnabled() {
  return process.env.WORLDLINE_ENABLED === '1' || process.env.WORLDLINE_ENABLED === 'true';
}

async function runOnce() {
  if (!isEnabled()) return;

  const staleAfterMinutes = parseInt(process.env.WORLDLINE_RECONCILE_STALE_MINUTES || '15', 10);
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);

  try {
    const candidates = await WorldlinePayment.find({
      status: { $in: ['created', 'initiated', 'pending', 'unknown'] },
      updatedAt: { $lte: cutoff },
    })
      .sort({ updatedAt: 1 })
      .limit(100)
      .lean();

    if (candidates.length === 0) return;

    for (const p of candidates) {
      // 1. Classify the stale attempt.
      const timeSinceUpdateMs = Date.now() - new Date(p.updatedAt).getTime();
      const isExtremelyStale = timeSinceUpdateMs > 24 * 60 * 60 * 1000; // 24 hours
      const sessionExpired = p.sessionExpiresAt && new Date(p.sessionExpiresAt).getTime() < Date.now();
      // created/initiated = the customer never completed the gateway flow
      // (closed the browser / abandoned checkout). Once the session expired,
      // the gateway can no longer complete it — fail as a timeout so the order
      // is voided instead of sitting in "awaiting payment" forever.
      const abandonedBeforeGateway =
        (p.status === 'created' || p.status === 'initiated') && sessionExpired;

      const update = {
        status: 'unknown',
        statusMessage: 'Reconciliation: stale pending payment',
        verificationSource: 'reconciliation',
      };

      if (abandonedBeforeGateway) {
        update.status = 'failed';
        update.statusMessage = 'Payment session expired without completion';
      } else if (isExtremelyStale) {
        update.status = 'failed';
        update.statusMessage = 'Reconciliation: timed out after 24h';
      }

      await WorldlinePayment.updateOne(
        { _id: p._id, status: p.status },
        { $set: update }
      );

      // 2. Update order if this was the latest attempt
      const latestAttempt = await WorldlinePayment.findOne({ orderId: p.orderId }).sort({ attemptNo: -1 });
      if (latestAttempt && String(latestAttempt._id) === String(p._id)) {
        // COD/wallet orders must never be touched by payment reconciliation —
        // an orphaned payment row must not flip their paymentStatus or notify.
        const orderForGuard = await Order.findById(p.orderId).select('paymentMethod').lean();
        const methodType = orderForGuard?.paymentMethod?.methodType;
        if (orderForGuard && methodType !== 'card' && methodType !== 'upi' && methodType !== 'digital') {
          logger.warn('[worldlineReconciliationJob] skipped non-gateway order with payment row', {
            orderId: String(p.orderId),
            methodType,
          });
          continue;
        }
        if (update.status === 'failed') {
          const o = await Order.findById(p.orderId).lean();
          if (o && o.fulfillmentReleased === false && o.paymentStatus !== 'paid') {
            try {
              await voidUnpaidOnlineOrder(
                String(o.userId),
                String(o._id),
                update.statusMessage || 'Payment timed out',
                'timeout'
              );
            } catch (e) {
              logger.warn('[worldlineReconciliationJob] voidUnpaidOnlineOrder failed', {
                orderId: String(p.orderId),
                error: e?.message,
              });
            }
          } else if (o && o.paymentStatus !== 'paid') {
            await Order.updateOne({ _id: p.orderId }, { $set: { paymentStatus: 'failed' } });
          }
        } else {
          // Never downgrade a paid order back to pending.
          await Order.updateOne(
            { _id: p.orderId, paymentStatus: { $ne: 'paid' } },
            { $set: { paymentStatus: 'pending' } }
          );
        }
      }
    }

    logger.warn('[worldlineReconciliationJob] marked stale payments as unknown', {
      count: candidates.length,
      staleAfterMinutes,
    });
  } catch (err) {
    logger.error('[worldlineReconciliationJob] run failed', { error: err?.message });
  }
}

function start(intervalMs = 5 * 60 * 1000) {
  runOnce();
  return setInterval(runOnce, intervalMs);
}

module.exports = { runOnce, start };

