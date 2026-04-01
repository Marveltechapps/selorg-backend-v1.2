/**
 * Central pricing engine skeleton (v1).
 *
 * This module is intentionally read-only with respect to existing flows:
 * - No integrations with cart/order services yet
 * - No side effects / DB writes
 * - Step functions are placeholders with consistent context contract
 */

const PRICING_VERSION = 'v1';
const { Product } = require('../models/Product');
const { PricingCoupon } = require('../../merch/models/PricingCoupon');
const FREE_DELIVERY_THRESHOLD = Number(process.env.PRICING_FREE_DELIVERY_THRESHOLD || 499);
const DEFAULT_DELIVERY_FEE = Number(process.env.PRICING_DELIVERY_FEE || 40);
const DEFAULT_HANDLING_CHARGE = Number(process.env.PRICING_HANDLING_CHARGE || 5);

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMode(mode) {
  const allowed = new Set(['cart', 'checkout', 'order', 'invoice']);
  const normalized = String(mode || '').toLowerCase();
  return allowed.has(normalized) ? normalized : 'cart';
}

function summarizeCartItems(cartItems) {
  const safeItems = Array.isArray(cartItems) ? cartItems : [];
  const itemCount = safeItems.reduce((sum, it) => sum + Math.max(0, toNumber(it.quantity, 0)), 0);
  const lineCount = safeItems.length;
  const productCount = new Set(safeItems.map((it) => String(it.productId || ''))).size;
  return { lineCount, itemCount, productCount };
}

function debugLog(stage, context, extra = {}) {
  const safeContext = context || {};
  const safeInput = safeContext.input || {};
  const summary = summarizeCartItems(safeInput.cartItems);
  const payload = {
    ts: nowIso(),
    stage,
    mode: safeInput.mode || 'cart',
    userId: safeInput.userId || null,
    couponCode: safeInput.couponCode || null,
    zone: safeInput.zone || null,
    paymentMethod: safeInput.paymentMethod || null,
    cartSummary: summary,
    totals: {
      itemTotal: toNumber(safeContext?.totals?.itemTotal, 0),
      discount: toNumber(safeContext?.totals?.discount, 0),
      deliveryFee: toNumber(safeContext?.totals?.deliveryFee, 0),
      handlingCharge: toNumber(safeContext?.totals?.handlingCharge, 0),
      tax: toNumber(safeContext?.totals?.tax, 0),
      finalAmount: toNumber(safeContext?.totals?.finalAmount, 0),
    },
    adjustmentsCount: Array.isArray(safeContext.adjustments) ? safeContext.adjustments.length : 0,
    ...extra,
  };
  console.debug('[pricing-engine]', JSON.stringify(payload));
}

function ensureZeroTotals(totals) {
  const safeTotals = totals || {};
  return {
    itemTotal: toNumber(safeTotals.itemTotal, 0),
    discount: toNumber(safeTotals.discount, 0),
    deliveryFee: toNumber(safeTotals.deliveryFee, 0),
    handlingCharge: toNumber(safeTotals.handlingCharge, 0),
    tax: toNumber(safeTotals.tax, 0),
    finalAmount: toNumber(safeTotals.finalAmount, 0),
  };
}

function buildInitialContext(input) {
  const normalized = {
    userId: input?.userId || null,
    cartItems: Array.isArray(input?.cartItems) ? input.cartItems : [],
    couponCode: input?.couponCode ? String(input.couponCode).trim().toUpperCase() : null,
    zone: input?.zone || null,
    paymentMethod: input?.paymentMethod || null,
    mode: normalizeMode(input?.mode),
  };

  return {
    input: normalized,
    items: normalized.cartItems.map((line, idx) => ({
      lineId: line.lineId || `line_${idx + 1}`,
      productId: line.productId || null,
      variantId: line.variantId || null,
      quantity: Math.max(1, toNumber(line.quantity, 1)),
      baseUnitPrice: toNumber(line.baseUnitPrice, 0),
      effectiveUnitPrice: toNumber(line.baseUnitPrice, 0),
      lineBaseTotal: 0,
      lineDiscountTotal: 0,
      lineTaxTotal: 0,
      lineFinalTotal: 0,
      metadata: {
        source: 'input',
      },
    })),
    adjustments: [],
    totals: {
      itemTotal: 0,
      discount: 0,
      deliveryFee: 0,
      handlingCharge: 0,
      tax: 0,
      finalAmount: 0,
    },
    appliedCoupon: null,
    pricingVersion: PRICING_VERSION,
    diagnostics: {
      startedAt: nowIso(),
      warnings: [],
    },
  };
}

async function getBasePrices(context) {
  const safeContext = context || buildInitialContext({});
  const next = { ...safeContext, items: Array.isArray(safeContext.items) ? [...safeContext.items] : [] };
  const resolvedItems = await Promise.all(
    next.items.map(async (item) => {
      const quantity = Math.max(1, toNumber(item.quantity, 1));
      let unitPrice = toNumber(item.baseUnitPrice, 0);
      let gstRate = 0;
      let source = 'fallback_input';

      try {
        if (item.productId) {
          const product = await Product.findById(item.productId).lean();
          if (product) {
            unitPrice = toNumber(product.price, unitPrice);
            gstRate = toNumber(product.gstRate, 0);
            source = 'product';
            if (Array.isArray(product.variants) && product.variants.length) {
              const variant = product.variants.find((v) => String(v._id) === String(item.variantId)) || null;
              if (variant) {
                unitPrice = toNumber(variant.price, unitPrice);
                source = 'variant';
              }
            }
          }
        }
      } catch (error) {
        source = 'fallback_error';
      }

      const lineBaseTotal = unitPrice * quantity;
      return {
        ...item,
        quantity,
        unitPrice,
        baseUnitPrice: unitPrice,
        effectiveUnitPrice: unitPrice,
        lineBaseTotal,
        lineDiscountTotal: 0,
        lineTaxTotal: 0,
        lineFinalTotal: lineBaseTotal,
        metadata: {
          ...(item.metadata || {}),
          source,
          gstRate,
        },
      };
    })
  );
  next.items = resolvedItems;
  next.totals = {
    ...ensureZeroTotals(next.totals),
    itemTotal: resolvedItems.reduce((sum, item) => sum + toNumber(item.lineBaseTotal, 0), 0),
  };
  debugLog('getBasePrices', next, { resolvedItems: resolvedItems.length });
  return next;
}

async function applyFlashSales(context) {
  const next = { ...(context || buildInitialContext({})), totals: ensureZeroTotals(context?.totals) };
  // Placeholder: no flash sale computation in phase-1.
  debugLog('applyFlashSales', next, { applied: false, reason: 'placeholder' });
  return next;
}

async function applyBundles(context) {
  const next = { ...(context || buildInitialContext({})), totals: ensureZeroTotals(context?.totals) };
  // Placeholder: no bundle computation in phase-1.
  debugLog('applyBundles', next, { applied: false, reason: 'placeholder' });
  return next;
}

async function applyPromotionRules(context) {
  const next = { ...(context || buildInitialContext({})), totals: ensureZeroTotals(context?.totals) };
  // Placeholder: no promotion-rule computation in phase-1.
  debugLog('applyPromotionRules', next, { applied: false, reason: 'placeholder' });
  return next;
}

async function applyCoupon(context) {
  const safeContext = context || buildInitialContext({});
  const next = { ...safeContext, totals: ensureZeroTotals(safeContext.totals) };
  const couponCode = next?.input?.couponCode;
  if (!couponCode) {
    debugLog('applyCoupon', next, { appliedCoupon: null, reason: 'no_coupon_code' });
    return next;
  }

  const itemTotal = toNumber(next.totals.itemTotal, 0);
  try {
    const coupon = await PricingCoupon.findOne({ code: String(couponCode).toUpperCase() }).lean();
    if (!coupon) {
      next.appliedCoupon = { code: String(couponCode).toUpperCase(), status: 'invalid', reason: 'not_found' };
      debugLog('applyCoupon', next, { appliedCoupon: next.appliedCoupon });
      return next;
    }

    const now = new Date();
    const statusActive = Boolean(coupon.isActive) && String(coupon.status || '').toLowerCase() === 'active';
    const start = coupon.startDate || coupon.validFrom || null;
    const end = coupon.endDate || coupon.validTo || null;
    const withinDateRange = (!start || now >= new Date(start)) && (!end || now <= new Date(end));
    const minOrderValue = toNumber(coupon.minOrderValue ?? coupon.minOrderAmount, 0);

    if (!statusActive || !withinDateRange || itemTotal < minOrderValue) {
      next.appliedCoupon = {
        code: coupon.code,
        status: 'invalid',
        reason: !statusActive ? 'inactive' : !withinDateRange ? 'expired_or_not_started' : 'min_order_not_met',
      };
      debugLog('applyCoupon', next, { appliedCoupon: next.appliedCoupon });
      return next;
    }

    const discountValue = toNumber(coupon.discountValue, 0);
    const discountType = String(coupon.discountType || '').toUpperCase();
    const maxDiscount = toNumber(coupon.maxDiscount ?? coupon.maxDiscountAmount, 0);
    let discountAmount = 0;
    if (discountType === 'FLAT' || discountType === 'FIXED' || discountType === 'FLAT_DISCOUNT') {
      discountAmount = discountValue;
    } else if (discountType === 'PERCENTAGE' || discountType === 'PERCENT' || discountType === 'PERCENTAGE_DISCOUNT') {
      discountAmount = (itemTotal * discountValue) / 100;
    }
    if (maxDiscount > 0) {
      discountAmount = Math.min(discountAmount, maxDiscount);
    }
    discountAmount = Math.min(itemTotal, Math.max(0, toNumber(discountAmount, 0)));

    next.adjustments = Array.isArray(next.adjustments) ? [...next.adjustments] : [];
    next.adjustments.push({
      type: 'COUPON',
      code: coupon.code,
      amount: discountAmount,
      couponId: coupon._id ? String(coupon._id) : undefined,
    });
    next.totals.discount = toNumber(next.totals.discount, 0) + discountAmount;
    next.appliedCoupon = {
      code: coupon.code,
      couponId: coupon._id ? String(coupon._id) : null,
      status: 'applied',
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      amount: discountAmount,
    };
  } catch (error) {
    next.appliedCoupon = {
      code: String(couponCode).toUpperCase(),
      status: 'invalid',
      reason: 'lookup_failed',
    };
  }
  debugLog('applyCoupon', next, {
    appliedCoupon: next.appliedCoupon ? { code: next.appliedCoupon.code, status: next.appliedCoupon.status } : null,
  });
  return next;
}

async function applyFees(context) {
  const safeContext = context || buildInitialContext({});
  const next = {
    ...safeContext,
    totals: {
      ...ensureZeroTotals(safeContext.totals),
      deliveryFee:
        toNumber(safeContext?.totals?.itemTotal, 0) >= FREE_DELIVERY_THRESHOLD ? 0 : DEFAULT_DELIVERY_FEE,
      handlingCharge: DEFAULT_HANDLING_CHARGE,
    },
  };
  debugLog('applyFees', next, {
    freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
    defaultDeliveryFee: DEFAULT_DELIVERY_FEE,
    handlingCharge: DEFAULT_HANDLING_CHARGE,
  });
  return next;
}

async function applyTax(context) {
  const safeContext = context || buildInitialContext({});
  const next = {
    ...safeContext,
    totals: {
      ...ensureZeroTotals(safeContext.totals),
      tax: 0, // Placeholder for phase-1
    },
  };
  debugLog('applyTax', next, { taxPolicy: 'placeholder' });
  return next;
}

async function finalizeTotals(context) {
  const safeContext = context || buildInitialContext({});
  const safeItems = Array.isArray(safeContext.items) ? safeContext.items : [];
  const safeTotals = ensureZeroTotals(safeContext.totals);
  const itemTotal =
    toNumber(safeTotals.itemTotal, 0) ||
    safeItems.reduce((sum, item) => sum + toNumber(item?.lineBaseTotal ?? item?.lineFinalTotal, 0), 0);
  const discount =
    toNumber(safeTotals.discount, 0) ||
    safeItems.reduce((sum, item) => sum + toNumber(item?.lineDiscountTotal, 0), 0);
  const deliveryFee = toNumber(safeTotals.deliveryFee, 0);
  const handlingCharge = toNumber(safeTotals.handlingCharge, 0);
  const tax = toNumber(safeTotals.tax, 0);
  const finalAmount = Math.max(0, itemTotal - discount + deliveryFee + handlingCharge + tax);

  const next = {
    ...safeContext,
    totals: {
      itemTotal,
      discount,
      deliveryFee,
      handlingCharge,
      tax,
      finalAmount,
    },
    diagnostics: {
      ...(safeContext.diagnostics || {}),
      completedAt: nowIso(),
    },
  };

  debugLog('finalizeTotals', next, { completed: true });
  return next;
}

function compareWithLegacy(cartData, engineTotals) {
  const oldItemTotal = toNumber(cartData?.itemTotal, 0);
  const oldFinal = toNumber(cartData?.finalAmount ?? cartData?.totalBill, 0);
  const safeEngineTotals = ensureZeroTotals(engineTotals);
  const newItemTotal = safeEngineTotals.itemTotal;
  const newFinal = safeEngineTotals.finalAmount;
  const itemTotalDiff = newItemTotal - oldItemTotal;
  const finalDiff = newFinal - oldFinal;
  const itemTotalDiffPct = oldItemTotal > 0 ? Math.abs(itemTotalDiff / oldItemTotal) * 100 : 0;
  const finalDiffPct = oldFinal > 0 ? Math.abs(finalDiff / oldFinal) * 100 : 0;
  let severity = 'info';
  if (itemTotalDiffPct > 5 || finalDiffPct > 5) {
    severity = 'error';
  } else if (itemTotalDiffPct > 1 || finalDiffPct > 1) {
    severity = 'warning';
  }

  debugLog(
    'compareWithLegacy',
    { input: { mode: 'cart', cartItems: [] }, totals: safeEngineTotals, adjustments: [] },
    {
      severity,
      oldItemTotal,
      newItemTotal,
      oldFinal,
      newFinal,
      itemTotalDiff,
      finalDiff,
      itemTotalDiffPct: Number(itemTotalDiffPct.toFixed(2)),
      finalDiffPct: Number(finalDiffPct.toFixed(2)),
    }
  );
}

/**
 * Main pricing orchestrator
 * @param {Object} input
 * @param {string=} input.userId
 * @param {Array=} input.cartItems
 * @param {string=} input.couponCode
 * @param {string=} input.zone
 * @param {string=} input.paymentMethod
 * @param {'cart'|'checkout'|'order'|'invoice'=} input.mode
 */
async function calculatePricing(input) {
  let context = buildInitialContext(input);
  debugLog('start', context, { message: 'Pricing calculation started' });

  if (!Array.isArray(context.items) || context.items.length === 0) {
    context = await finalizeTotals({
      ...context,
      items: [],
      totals: ensureZeroTotals(context.totals),
    });

    return {
      items: [],
      adjustments: Array.isArray(context.adjustments) ? context.adjustments : [],
      totals: ensureZeroTotals(context.totals),
      appliedCoupon: context.appliedCoupon || null,
      pricingVersion: PRICING_VERSION,
    };
  }

  context = await getBasePrices(context);
  context = await applyFlashSales(context);
  context = await applyBundles(context);
  context = await applyPromotionRules(context);
  context = await applyCoupon(context);
  context = await applyFees(context);
  context = await applyTax(context);
  context = await finalizeTotals(context);

  return {
    items: Array.isArray(context.items) ? context.items : [],
    adjustments: Array.isArray(context.adjustments) ? context.adjustments : [],
    totals: ensureZeroTotals(context.totals),
    appliedCoupon: context.appliedCoupon,
    pricingVersion: PRICING_VERSION,
  };
}

module.exports = {
  calculatePricing,
  // Exported for future targeted unit tests and phased implementation.
  getBasePrices,
  applyFlashSales,
  applyBundles,
  applyPromotionRules,
  applyCoupon,
  applyFees,
  applyTax,
  finalizeTotals,
  compareWithLegacy,
};
