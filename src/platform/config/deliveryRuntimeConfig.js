/**
 * Runtime delivery / ETA / fee knobs sourced from Platform Config (Mongo + Redis cache).
 * Falls back to environment variables, then safe defaults.
 *
 * Keys (optional in DB — missing keys use fallbacks):
 * - delivery.radius.default_km
 * - delivery.assign_search_max_m
 * - delivery.eta.avg_speed_kmh
 * - delivery.eta.buffer_minutes
 * - delivery.eta.promise_lower_delta
 * - delivery.eta.promise_upper_delta
 * - delivery.eta.min_lower_bound_mins
 * - delivery.fee.base
 * - delivery.fee.distance_per_km
 * - delivery.fee.free_delivery_threshold
 * - delivery.fee.min
 * - delivery.fee.max
 * - delivery.fee.platform_small_order_threshold
 * - delivery.fee.platform_fee_small_order
 * - delivery.fee.surge_line_fraction
 */
const { getPublishedValue } = require('../services/platformConfigService');

function num(raw, fallback) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function getDeliveryRuntimeConfig() {
  const [
    defaultRadiusKmRaw,
    assignSearchMaxM,
    etaAvgSpeedKmh,
    etaBufferMin,
    etaPromiseLowerDelta,
    etaPromiseUpperDelta,
    etaMinLowerBound,
    feeBase,
    feePerKm,
    freeDeliveryThreshold,
    feeMin,
    feeMax,
    platformSmallOrderThreshold,
    platformFeeSmallOrder,
    surgeLineFraction,
  ] = await Promise.all([
    getPublishedValue(
      'delivery.radius.default_km',
      num(Number(process.env.DELIVERY_DEFAULT_RADIUS_KM), 5)
    ),
    getPublishedValue(
      'delivery.assign_search_max_m',
      num(Number(process.env.DELIVERY_ASSIGN_SEARCH_MAX_M), 10000)
    ),
    getPublishedValue(
      'delivery.eta.avg_speed_kmh',
      num(Number(process.env.DELIVERY_ETA_AVG_SPEED_KMH), 30)
    ),
    getPublishedValue(
      'delivery.eta.buffer_minutes',
      num(Number(process.env.DELIVERY_ETA_BUFFER_MINUTES), 2)
    ),
    getPublishedValue(
      'delivery.eta.promise_lower_delta',
      num(Number(process.env.DELIVERY_ETA_PROMISE_LOWER_DELTA), 2)
    ),
    getPublishedValue(
      'delivery.eta.promise_upper_delta',
      num(Number(process.env.DELIVERY_ETA_PROMISE_UPPER_DELTA), 3)
    ),
    getPublishedValue(
      'delivery.eta.min_lower_bound_mins',
      num(Number(process.env.DELIVERY_ETA_MIN_LOWER_BOUND_MINS), 8)
    ),
    getPublishedValue('delivery.fee.base', num(Number(process.env.DELIVERY_FEE_BASE), 20)),
    getPublishedValue(
      'delivery.fee.distance_per_km',
      num(Number(process.env.DELIVERY_FEE_PER_KM), 1)
    ),
    getPublishedValue(
      'delivery.fee.free_delivery_threshold',
      num(Number(process.env.DELIVERY_FREE_THRESHOLD), 399)
    ),
    getPublishedValue('delivery.fee.min', num(Number(process.env.DELIVERY_FEE_MIN), 20)),
    getPublishedValue('delivery.fee.max', num(Number(process.env.DELIVERY_FEE_MAX), 100)),
    getPublishedValue(
      'delivery.fee.platform_small_order_threshold',
      num(Number(process.env.DELIVERY_PLATFORM_SMALL_ORDER_THRESHOLD), 99)
    ),
    getPublishedValue(
      'delivery.fee.platform_fee_small_order',
      num(Number(process.env.DELIVERY_PLATFORM_FEE_SMALL), 5)
    ),
    getPublishedValue(
      'delivery.fee.surge_line_fraction',
      num(Number(process.env.DELIVERY_SURGE_LINE_FRACTION), 0.5)
    ),
  ]);

  const feeMinResolved = Math.max(0, num(feeMin, 20));
  const feeMaxResolved = Math.max(feeMinResolved, num(feeMax, 100));

  return {
    defaultRadiusKm: Math.max(0.1, num(defaultRadiusKmRaw, 5)),
    assignSearchMaxM: Math.max(100, num(assignSearchMaxM, 10000)),
    etaAvgSpeedKmh: Math.max(1, num(etaAvgSpeedKmh, 30)),
    etaBufferMin: Math.max(0, num(etaBufferMin, 2)),
    etaPromiseLowerDelta: Math.max(0, num(etaPromiseLowerDelta, 2)),
    etaPromiseUpperDelta: Math.max(0, num(etaPromiseUpperDelta, 3)),
    etaMinLowerBound: Math.max(1, num(etaMinLowerBound, 8)),
    feeBase: Math.max(0, num(feeBase, 20)),
    feePerKm: Math.max(0, num(feePerKm, 1)),
    freeDeliveryThreshold: Math.max(0, num(freeDeliveryThreshold, 399)),
    feeMin: feeMinResolved,
    feeMax: feeMaxResolved,
    platformSmallOrderThreshold: Math.max(0, num(platformSmallOrderThreshold, 99)),
    platformFeeSmallOrder: Math.max(0, num(platformFeeSmallOrder, 5)),
    surgeLineFraction: Math.min(1, Math.max(0, num(surgeLineFraction, 0.5))),
  };
}

module.exports = { getDeliveryRuntimeConfig, num };
