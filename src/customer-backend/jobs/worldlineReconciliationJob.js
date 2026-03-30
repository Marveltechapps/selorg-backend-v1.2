const logger = require('../../core/utils/logger');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const { Order } = require('../models/Order');

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
      // Without a gateway status-enquiry API in this codebase, we can only mark the attempt as stale.
      // This enables UI recovery via /payments/worldline/status and allows safe retry.
      await WorldlinePayment.updateOne(
        { _id: p._id, status: p.status },
        { $set: { status: 'unknown', statusMessage: 'Reconciliation: stale pending payment (no final response received)' } }
      );

      try {
        await Order.updateOne(
          { _id: p.orderId, paymentStatus: { $in: ['pending'] } },
          { $set: { paymentStatus: 'pending' } }
        );
      } catch {
        // non-blocking
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

