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
      // 1. Logic for marking as unknown/stale
      // This allows the frontend to offer a RETRY or CONTACT_SUPPORT action
      const timeSinceUpdateMs = Date.now() - new Date(p.updatedAt).getTime();
      const isExtremelyStale = timeSinceUpdateMs > 24 * 60 * 60 * 1000; // 24 hours

      const update = {
        status: 'unknown',
        statusMessage: 'Reconciliation: stale pending payment',
        verificationSource: 'reconciliation',
      };

      if (isExtremelyStale) {
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
        if (update.status === 'failed') {
          const o = await Order.findById(p.orderId).lean();
          if (o && o.fulfillmentReleased === false) {
            try {
              await voidUnpaidOnlineOrder(String(o.userId), String(o._id), update.statusMessage || 'Payment timed out');
            } catch (e) {
              logger.warn('[worldlineReconciliationJob] voidUnpaidOnlineOrder failed', {
                orderId: String(p.orderId),
                error: e?.message,
              });
            }
          } else {
            await Order.updateOne({ _id: p.orderId }, { $set: { paymentStatus: 'failed' } });
          }
        } else {
          await Order.updateOne({ _id: p.orderId }, { $set: { paymentStatus: 'pending' } });
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

