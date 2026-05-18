const { DarkStore } = require('../models/DarkStore');
const { getDistanceKm } = require('./storeController');
const { getDeliveryRuntimeConfig } = require('../../platform/config/deliveryRuntimeConfig');

async function getDeliveryEstimate(req, res) {
  try {
    const { storeId, latitude, longitude, cartItemCount } = req.query;

    if (!storeId || !latitude || !longitude) {
      return res.status(400).json({ error: 'storeId, latitude, and longitude are required' });
    }

    const cfg = await getDeliveryRuntimeConfig();

    const store = await DarkStore.findById(storeId).lean();
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const distanceKm = getDistanceKm(
      Number(latitude),
      Number(longitude),
      store.location.coordinates[1],
      store.location.coordinates[0]
    );

    const pickPackTime = store.avgPickPackTime || 5;
    const itemBonus = Math.min(3, Math.floor((Number(cartItemCount) || 1) / 5));
    const avgSpeedKmPerMin = cfg.etaAvgSpeedKmh / 60;
    const travelTime = Math.ceil(distanceKm / avgSpeedKmPerMin);
    const bufferTime = cfg.etaBufferMin;

    const totalMinutes = pickPackTime + itemBonus + travelTime + bufferTime;
    const lowerBound = Math.max(
      cfg.etaMinLowerBound,
      totalMinutes - cfg.etaPromiseLowerDelta
    );
    const upperBound = totalMinutes + cfg.etaPromiseUpperDelta;

    res.json({
      estimatedMinutes: totalMinutes,
      promiseText: `${lowerBound}-${upperBound} mins`,
      breakdown: {
        pickPackTime,
        travelTime,
        bufferTime,
        itemBonus,
        distanceKm: Math.round(distanceKm * 10) / 10,
      },
    });
  } catch (err) {
    console.error('getDeliveryEstimate error:', err);
    res.status(500).json({ error: 'Failed to calculate delivery estimate' });
  }
}

async function getDeliveryFee(req, res) {
  try {
    const { storeId, latitude, longitude, orderTotal } = req.query;

    if (!storeId || !latitude || !longitude) {
      return res.status(400).json({ error: 'storeId, latitude, and longitude are required' });
    }

    const cfg = await getDeliveryRuntimeConfig();

    const store = await DarkStore.findById(storeId).lean();
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const distanceKm = getDistanceKm(
      Number(latitude),
      Number(longitude),
      store.location.coordinates[1],
      store.location.coordinates[0]
    );

    const total = Number(orderTotal) || 0;
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Dynamic Pricing Algorithm (surge bands remain code-defined; amounts from platform config)
    const BASE_DELIVERY_FEE = cfg.feeBase;
    const DISTANCE_SURCHARGE_PER_KM = cfg.feePerKm;
    
    // Calculate surge multiplier based on time of day and demand
    let surgeMult = 1.0;
    if (hour >= 12 && hour <= 14) surgeMult = 1.5; // Lunch: 12-2pm
    if (hour >= 19 && hour <= 21) surgeMult = 1.8; // Dinner: 7-9pm
    if (hour >= 22 || hour < 6) surgeMult = 1.3;   // Night: 10pm-6am

    // High demand weekend multiplier (Fri-Sat evenings)
    if ((dayOfWeek === 5 || dayOfWeek === 6) && (hour >= 18 && hour <= 22)) {
      surgeMult = Math.max(surgeMult, 2.0); // Cap at 2x
    }

    // Demand-based multiplier (simulated - in production would use load %)
    const storeLoadMultiplier = store.currentOrderCount && store.currentOrderCount > 50 ? 1.2 : 1.0;

    // Free delivery above ₹399, else apply full calculation
    let deliveryFee = 0;
    let platformFee = 0;
    let freeDeliveryApplied = false;

    if (total >= cfg.freeDeliveryThreshold) {
      freeDeliveryApplied = true;
      deliveryFee = 0;
    } else {
      // Apply dynamic pricing: base + distance surcharge + surge + demand multiplier
      deliveryFee = (BASE_DELIVERY_FEE + (distanceKm * DISTANCE_SURCHARGE_PER_KM)) * surgeMult * storeLoadMultiplier;
      deliveryFee = Math.round(deliveryFee);
      
      deliveryFee = Math.max(cfg.feeMin, Math.min(cfg.feeMax, deliveryFee));
    }

    if (total < cfg.platformSmallOrderThreshold) {
      platformFee = cfg.platformFeeSmallOrder;
    }

    const surgeCharge =
      deliveryFee > cfg.feeBase
        ? Math.round((deliveryFee - cfg.feeBase) * cfg.surgeLineFraction)
        : 0;

    res.json({
      deliveryFee,
      platformFee,
      surgeCharge,
      freeDeliveryApplied,
      freeDeliveryThreshold: cfg.freeDeliveryThreshold,
      distanceKm: Math.round(distanceKm * 10) / 10,
      breakdown: {
        baseDeliveryFee: BASE_DELIVERY_FEE,
        distanceSurcharge: Math.round(distanceKm * DISTANCE_SURCHARGE_PER_KM),
        surgePeakMultiplier: surgeMult.toFixed(1),
        demandMultiplier: storeLoadMultiplier.toFixed(1),
        timeOfDay: `${hour}:00 (${getPeakHourLabel(hour)})`,
      },
    });
  } catch (err) {
    console.error('getDeliveryFee error:', err);
    res.status(500).json({ error: 'Failed to calculate delivery fee' });
  }
}

function getPeakHourLabel(hour) {
  if (hour >= 12 && hour <= 14) return 'Lunch Peak';
  if (hour >= 19 && hour <= 21) return 'Dinner Peak';
  if (hour >= 22 || hour < 6) return 'Night';
  return 'Off-peak';
}

module.exports = { getDeliveryEstimate, getDeliveryFee, getPeakHourLabel };
