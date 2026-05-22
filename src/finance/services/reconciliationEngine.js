const mongoose = require('mongoose');
const LiveTransaction = require('../models/LiveTransaction');
const CustomerPayment = require('../models/CustomerPayment');
const ReconciliationException = require('../models/ReconciliationException');
const ReconciliationRule = require('../models/ReconciliationRule');
const ReconciliationRun = require('../models/ReconciliationRun');
const { buildDayRange } = require('../utils/financeEntityScope');
const {
  RECON_GATEWAYS,
  normalizeGatewayKey,
  gatewayLabel,
  listGatewayKeys,
} = require('../utils/reconciliationGateways');
const logger = require('../../utils/logger');

const SETTLED_PAYMENT_STATUSES = ['captured', 'authorized'];
const LIVE_SUCCESS = 'success';
const LIVE_PENDING = 'pending';
const LIVE_FAILED = 'failed';

function amountsClose(a, b, tolerance) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  return Math.abs(x - y) <= tolerance;
}

function maxAmountSpread(...values) {
  const nums = values.map((v) => Number(v) || 0).filter((n) => n > 0);
  if (nums.length < 2) return 0;
  return Math.max(...nums) - Math.min(...nums);
}

async function loadTolerance() {
  try {
    const rule = await ReconciliationRule.findOne({
      type: 'payment',
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (!rule) return { amount: 1, percent: 0 };
    const pct = Number(rule.tolerancePercentage) || 0;
    return {
      amount: Number(rule.toleranceAmount) || 1,
      percent: pct,
    };
  } catch {
    return { amount: 1, percent: 0 };
  }
}

function toleranceForAmount(baseAmount, toleranceConfig) {
  const base = Number(baseAmount) || 0;
  const pctAmt = toleranceConfig.percent > 0 ? (base * toleranceConfig.percent) / 100 : 0;
  return Math.max(toleranceConfig.amount, pctAmt);
}

async function loadOrderContext(orderKeys) {
  const unique = [...new Set(orderKeys.filter(Boolean))];
  if (!unique.length) {
    return { byOrderNumber: new Map(), byObjectId: new Map(), objectIds: [] };
  }

  const { Order } = require('../../customer-backend/models/Order');
  const objectIds = unique.filter((k) => mongoose.Types.ObjectId.isValid(k));
  const orders = await Order.find({
    $or: [{ orderNumber: { $in: unique } }, ...(objectIds.length ? [{ _id: { $in: objectIds } }] : [])],
  })
    .select('orderNumber totalBill paymentStatus paymentMethod')
    .lean();

  const byOrderNumber = new Map();
  const byObjectId = new Map();
  for (const order of orders) {
    const meta = {
      orderNumber: order.orderNumber,
      totalBill: order.totalBill,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      objectId: String(order._id),
    };
    if (order.orderNumber) byOrderNumber.set(order.orderNumber, meta);
    byObjectId.set(String(order._id), meta);
  }

  return {
    byOrderNumber,
    byObjectId,
    objectIds: orders.map((o) => o._id),
  };
}

function resolveOrderMeta(orderKey, orderContext) {
  if (!orderKey) return null;
  const key = String(orderKey);
  return orderContext.byOrderNumber.get(key) || orderContext.byObjectId.get(key) || null;
}

async function upsertException(payload) {
  const {
    runId,
    orderId,
    txnId,
    gateway,
    title,
    reasonCode,
    amount,
    sourceType = 'gateway',
    suggestedAction = 'investigate',
    details,
  } = payload;

  const query = {
    gateway,
    reasonCode,
    status: { $in: ['open', 'in_review'] },
  };
  if (orderId) query.orderId = String(orderId);
  else if (txnId) query.txnId = String(txnId);

  const existing = await ReconciliationException.findOne(query);
  if (existing) {
    existing.title = title;
    existing.amount = amount;
    existing.details = details;
    existing.suggestedAction = suggestedAction;
    if (runId) existing.runId = runId;
    if (txnId) existing.txnId = txnId;
    await existing.save();
    return { created: false, exception: existing };
  }

  const created = await ReconciliationException.create({
    title,
    sourceType,
    gateway,
    amount,
    currency: 'INR',
    status: 'open',
    reasonCode,
    orderId: orderId ? String(orderId) : undefined,
    txnId: txnId ? String(txnId) : undefined,
    runId,
    details,
    suggestedAction,
  });
  return { created: true, exception: created };
}

function mapExceptionDto(ex) {
  return {
    id: ex._id.toString(),
    title: ex.title,
    sourceType: ex.sourceType,
    gateway: ex.gateway,
    amount: ex.amount,
    currency: ex.currency || 'INR',
    status: ex.status,
    reasonCode: ex.reasonCode,
    createdAt: ex.createdAt?.toISOString?.() || ex.createdAt,
    details: ex.details,
    suggestedAction: ex.suggestedAction,
    orderId: ex.orderId,
    txnId: ex.txnId,
  };
}

/**
 * Compare live transactions, customer payments, orders, and Worldline records for one gateway/day.
 */
async function analyzeGateway(gatewayKey, startDate, endDate, options = {}) {
  const { createExceptions = false, runId = null } = options;
  const config = RECON_GATEWAYS[normalizeGatewayKey(gatewayKey)];
  if (!config) {
    throw new Error(`Unknown gateway: ${gatewayKey}`);
  }

  const toleranceConfig = await loadTolerance();
  const liveGateway = config.liveGateway;

  const liveTxns = await LiveTransaction.find({
    gateway: liveGateway,
    createdAt: { $gte: startDate, $lte: endDate },
  }).lean();

  const orderKeys = liveTxns.map((t) => t.orderId).filter(Boolean);
  const orderContext = await loadOrderContext(orderKeys);

  const payments = orderKeys.length
    ? await CustomerPayment.find({ orderId: { $in: orderKeys } }).lean()
    : [];
  const paymentByOrder = new Map(payments.map((p) => [String(p.orderId), p]));

  let worldlineByOrderId = new Map();
  if (gatewayKey === 'worldline' && orderContext.objectIds.length) {
    try {
      const { WorldlinePayment } = require('../../customer-backend/models/WorldlinePayment');
      const wlRows = await WorldlinePayment.find({
        $or: [
          { orderId: { $in: orderContext.objectIds } },
          { createdAt: { $gte: startDate, $lte: endDate } },
        ],
      }).lean();

      for (const wl of wlRows) {
        const oid = String(wl.orderId);
        const meta = orderContext.byObjectId.get(oid);
        const orderNumber = meta?.orderNumber;
        if (orderNumber) worldlineByOrderId.set(orderNumber, wl);
        worldlineByOrderId.set(oid, wl);
      }
    } catch (err) {
      logger.warn('WorldlinePayment load skipped for reconciliation', { err: err.message });
    }
  }

  let matchedAmount = 0;
  let pendingAmount = 0;
  let exceptionsCreated = 0;
  let exceptionsUpdated = 0;
  const matchedTxnIds = new Set();

  for (const txn of liveTxns) {
    const orderKey = String(txn.orderId || '');
    const orderMeta = resolveOrderMeta(orderKey, orderContext);
    const payment = paymentByOrder.get(orderKey);
    const worldline =
      gatewayKey === 'worldline'
        ? worldlineByOrderId.get(orderKey) ||
          (orderMeta ? worldlineByOrderId.get(orderMeta.objectId) : null)
        : null;

    const orderAmount = orderMeta?.totalBill ?? txn.amount;
    const tolerance = toleranceForAmount(orderAmount, toleranceConfig);

    if (txn.status === LIVE_SUCCESS) {
      const paymentSettled =
        payment && SETTLED_PAYMENT_STATUSES.includes(payment.status);
      const wlSuccess = worldline?.status === 'success';
      const orderPaid = orderMeta?.paymentStatus === 'paid';

      if (gatewayKey === 'worldline') {
        const spread = maxAmountSpread(txn.amount, payment?.amount, worldline?.amountInr, orderAmount);
        if (paymentSettled && (wlSuccess || !worldline) && spread <= tolerance) {
          matchedAmount += txn.amount;
          matchedTxnIds.add(txn.txnId);
        } else {
          if (spread > tolerance) {
            pendingAmount += txn.amount;
            if (createExceptions) {
              const r = await upsertException({
                runId,
                orderId: orderKey,
                txnId: txn.txnId,
                gateway: liveGateway,
                title: `Amount mismatch — ${orderKey || txn.txnId}`,
                reasonCode: 'amount_mismatch',
                amount: Math.abs(txn.amount - (payment?.amount ?? worldline?.amountInr ?? orderAmount)),
                details: `Live ₹${txn.amount} vs payment ₹${payment?.amount ?? '—'} vs Worldline ₹${worldline?.amountInr ?? '—'} (tolerance ₹${tolerance})`,
                suggestedAction: 'investigate',
              });
              if (r.created) exceptionsCreated += 1;
              else exceptionsUpdated += 1;
            }
          } else if (!paymentSettled && wlSuccess) {
            pendingAmount += txn.amount;
            if (createExceptions) {
              const r = await upsertException({
                runId,
                orderId: orderKey,
                txnId: txn.txnId,
                gateway: liveGateway,
                title: `Worldline captured, internal payment pending — ${orderKey}`,
                reasonCode: 'status_mismatch',
                amount: txn.amount,
                details: 'Gateway reports success but CustomerPayment is not captured/authorized.',
                suggestedAction: 'retry_match',
              });
              if (r.created) exceptionsCreated += 1;
              else exceptionsUpdated += 1;
            }
          } else if (!wlSuccess && worldline) {
            pendingAmount += txn.amount;
            if (createExceptions) {
              const r = await upsertException({
                runId,
                orderId: orderKey,
                txnId: txn.txnId,
                gateway: liveGateway,
                title: `Live success, Worldline not settled — ${orderKey}`,
                reasonCode: 'status_mismatch',
                amount: txn.amount,
                details: `Worldline status: ${worldline.status}`,
                suggestedAction: 'investigate',
              });
              if (r.created) exceptionsCreated += 1;
              else exceptionsUpdated += 1;
            }
          } else if (!paymentSettled && !wlSuccess) {
            pendingAmount += txn.amount;
          }
        }
      } else if (gatewayKey === 'cod') {
        if (orderPaid || paymentSettled) {
          matchedAmount += txn.amount;
          matchedTxnIds.add(txn.txnId);
        } else {
          pendingAmount += txn.amount;
          if (createExceptions && !orderPaid) {
            const r = await upsertException({
              runId,
              orderId: orderKey,
              txnId: txn.txnId,
              gateway: liveGateway,
              title: `COD not collected — ${orderKey}`,
              reasonCode: 'cod_unsettled',
              amount: txn.amount,
              details: 'Cash order recorded but payment/order status is not marked paid.',
              suggestedAction: 'resolve',
            });
            if (r.created) exceptionsCreated += 1;
            else exceptionsUpdated += 1;
          }
        }
      }
    } else if (txn.status === LIVE_PENDING) {
      pendingAmount += txn.amount;
      if (gatewayKey === 'worldline' && worldline?.status === 'success') {
        if (createExceptions) {
          const r = await upsertException({
            runId,
            orderId: orderKey,
            txnId: txn.txnId,
            gateway: liveGateway,
            title: `Gateway settled, live feed pending — ${orderKey}`,
            reasonCode: 'status_mismatch',
            amount: txn.amount,
            details: 'Worldline payment succeeded but LiveTransaction is still pending.',
            suggestedAction: 'retry_match',
          });
          if (r.created) exceptionsCreated += 1;
          else exceptionsUpdated += 1;
        }
      }
    } else if (txn.status === LIVE_FAILED) {
      if (payment && SETTLED_PAYMENT_STATUSES.includes(payment.status)) {
        if (createExceptions) {
          const r = await upsertException({
            runId,
            orderId: orderKey,
            txnId: txn.txnId,
            gateway: liveGateway,
            title: `Failed live txn, settled payment — ${orderKey}`,
            reasonCode: 'status_mismatch',
            amount: payment.amount,
            details: 'CustomerPayment is captured but live transaction shows failed.',
            suggestedAction: 'investigate',
          });
          if (r.created) exceptionsCreated += 1;
          else exceptionsUpdated += 1;
        }
      }
    }
  }

  if (gatewayKey === 'worldline') {
    try {
      const { WorldlinePayment } = require('../../customer-backend/models/WorldlinePayment');
      const wlSuccesses = await WorldlinePayment.find({
        status: 'success',
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      for (const wl of wlSuccesses) {
        const meta = orderContext.byObjectId.get(String(wl.orderId));
        const orderNumber = meta?.orderNumber || String(wl.orderId);
        const hasLive = liveTxns.some(
          (t) =>
            matchedTxnIds.has(t.txnId) ||
            t.orderId === orderNumber ||
            t.txnId === wl.txnId
        );
        if (!hasLive) {
          if (createExceptions) {
            const r = await upsertException({
              runId,
              orderId: orderNumber,
              txnId: wl.txnId,
              gateway: liveGateway,
              title: `Worldline payment missing from live feed — ${orderNumber}`,
              reasonCode: 'missing_live_txn',
              amount: wl.amountInr,
              details: `Worldline txn ${wl.txnId} succeeded but no matching LiveTransaction for the day.`,
              suggestedAction: 'retry_match',
            });
            if (r.created) exceptionsCreated += 1;
            else exceptionsUpdated += 1;
          }
          pendingAmount += wl.amountInr;
        }
      }
    } catch (err) {
      logger.warn('Worldline orphan check failed', { err: err.message });
    }
  }

  const openExceptions = await ReconciliationException.find({
    gateway: liveGateway,
    status: { $in: ['open', 'in_review'] },
    createdAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const mismatchAmount = openExceptions.reduce((s, e) => s + (e.amount || 0), 0);

  const totalVolume = matchedAmount + pendingAmount + mismatchAmount;
  const matchPercent =
    totalVolume > 0 ? Math.round((matchedAmount / totalVolume) * 10000) / 100 : 100;

  let status = 'matched';
  if (matchPercent < 95 || mismatchAmount > 0) status = 'mismatch';
  else if (matchPercent < 99 || pendingAmount > 0) status = 'pending';

  return {
    gatewayKey,
    gateway: gatewayLabel(gatewayKey),
    liveGateway,
    matchedAmount,
    pendingAmount,
    mismatchAmount,
    matchPercent,
    status,
    transactionsChecked: liveTxns.length,
    exceptionsCreated,
    exceptionsUpdated,
  };
}

async function getLastRunAtForGateway(gatewayKey) {
  const run = await ReconciliationRun.findOne({
    gateways: gatewayKey,
    status: 'success',
  })
    .sort({ finishedAt: -1 })
    .select('finishedAt startedAt')
    .lean();
  return (run?.finishedAt || run?.startedAt)?.toISOString?.() || null;
}

async function buildSummaryForDate(dateInput) {
  const { startDate, endDate } = buildDayRange(dateInput);
  const keys = listGatewayKeys();

  const liveDistinct = await LiveTransaction.distinct('gateway', {
    createdAt: { $gte: startDate, $lte: endDate },
  });
  const keysToSummarize = new Set(keys);
  for (const g of liveDistinct) {
    const normalized = normalizeGatewayKey(g);
    if (RECON_GATEWAYS[normalized]) keysToSummarize.add(normalized);
  }

  const summaries = await Promise.all(
    [...keysToSummarize].map(async (key) => {
      const analysis = await analyzeGateway(key, startDate, endDate, { createExceptions: false });
      const lastRunAt = (await getLastRunAtForGateway(key)) || new Date().toISOString();
      return {
        id: key,
        gateway: analysis.gateway,
        matchedAmount: analysis.matchedAmount,
        pendingAmount: analysis.pendingAmount,
        mismatchAmount: analysis.mismatchAmount,
        status: analysis.status,
        matchPercent: analysis.matchPercent,
        lastRunAt,
      };
    })
  );

  return summaries.filter((s) => s.matchedAmount > 0 || s.pendingAmount > 0 || s.mismatchAmount > 0);
}

async function executeReconciliationRun(dateInput, gatewayKeys) {
  const { startDate, endDate } = buildDayRange(dateInput);
  const normalized = (gatewayKeys || [])
    .map(normalizeGatewayKey)
    .filter((k) => RECON_GATEWAYS[k]);

  if (!normalized.length) {
    throw new Error('Select at least one valid gateway (worldline, cod)');
  }

  const run = await ReconciliationRun.create({
    startedAt: new Date(),
    status: 'running',
    period: { from: startDate, to: endDate },
    gateways: normalized,
    stats: {},
  });

  try {
    let totals = {
      transactionsChecked: 0,
      matchedAmount: 0,
      pendingAmount: 0,
      mismatchAmount: 0,
      exceptionsCreated: 0,
      exceptionsUpdated: 0,
    };

    for (const key of normalized) {
      const result = await analyzeGateway(key, startDate, endDate, {
        createExceptions: true,
        runId: run._id,
      });
      totals.transactionsChecked += result.transactionsChecked;
      totals.matchedAmount += result.matchedAmount;
      totals.pendingAmount += result.pendingAmount;
      totals.mismatchAmount += result.mismatchAmount;
      totals.exceptionsCreated += result.exceptionsCreated;
      totals.exceptionsUpdated += result.exceptionsUpdated;
    }

    run.status = 'success';
    run.finishedAt = new Date();
    run.stats = totals;
    await run.save();

    return mapRunDto(run.toObject());
  } catch (err) {
    run.status = 'failed';
    run.finishedAt = new Date();
    run.errorMessage = err.message;
    await run.save();
    throw err;
  }
}

function mapRunDto(run) {
  return {
    id: run._id.toString(),
    startedAt: run.startedAt?.toISOString?.() || run.startedAt,
    finishedAt: run.finishedAt?.toISOString?.() || run.finishedAt,
    status: run.status,
    period: {
      from: run.period?.from?.toISOString?.() || run.period?.from,
      to: run.period?.to?.toISOString?.() || run.period?.to,
    },
    gateways: run.gateways || [],
    stats: run.stats || {},
    errorMessage: run.errorMessage,
  };
}

module.exports = {
  listGatewayKeys,
  gatewayLabel,
  buildSummaryForDate,
  executeReconciliationRun,
  analyzeGateway,
  mapExceptionDto,
  mapRunDto,
};
