const Order = require('../../warehouse/models/Order');
const Rider = require('../../rider/models/Rider');
const Zone = require('../models/Zone');
const Store = require('../models/Store');
const OpsIncident = require('../models/OpsIncident');
const OpsException = require('../models/OpsException');
const OpsIntegrationHealth = require('../models/OpsIntegrationHealth');
const OpsSurgeConfig = require('../models/OpsSurgeConfig');
const OpsDispatchConfig = require('../models/OpsDispatchConfig');
const OpsSlaConfig = require('../models/OpsSlaConfig');
const { CustomerUser } = require('../../customer-backend/models/CustomerUser');
const Notification = require('../../customer-backend/models/Notification');
const websocketService = require('../../utils/websocket');
const logger = require('../../core/utils/logger');

const DEFAULT_CITY_ID = 'default';
const MAX_DISPATCH_LOG_ENTRIES = 100;

async function appendDispatchLog(cityId, entry) {
  const logEntry = {
    timestamp: new Date(),
    action: entry.action,
    message: entry.message || '',
    status: entry.status || 'running',
    userId: entry.userId || null,
  };
  await OpsDispatchConfig.findOneAndUpdate(
    { cityId },
    {
      $push: {
        activityLog: {
          $each: [logEntry],
          $position: 0,
          $slice: MAX_DISPATCH_LOG_ENTRIES,
        },
      },
    },
    { upsert: true }
  );
}

/**
 * Format seconds to "Xm Ys"
 */
function formatDeliveryTime(seconds) {
  if (!seconds || seconds <= 0) return '0m 00s';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/**
 * Get live metrics for KPI strip
 */
async function getLiveMetrics(cityId = DEFAULT_CITY_ID) {
  try {
    const slaConfig = await OpsSlaConfig.findOne({ cityId }).lean();
    const targetSeconds = (slaConfig?.targetMinutes ?? 15) * 60;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let orderFlowPerHour = 0;
    let orderFlowTrend = 0;
    let avgDeliveryTimeSeconds = 0;
    let activeRiders = 0;
    let riderUtilizationPercent = 0;
    let activeIncidentsCount = 0;
    let totalOrdersLast24h = 0;
    let totalRiders = 0;

    try {
      const [lastHourOrders, prevHourOrders, deliveredOrders, activeRidersCount, busyRidersCount, incidentsCount, orders24h, ridersTotal] =
        await Promise.all([
          Order.countDocuments({ createdAt: { $gte: oneHourAgo } }),
          Order.countDocuments({ createdAt: { $gte: twoHoursAgo, $lt: oneHourAgo } }),
          Order.find({
            status: 'delivered',
            completedAt: { $gte: twentyFourHoursAgo },
            deliveryTimeSeconds: { $exists: true, $ne: null },
          }).select('deliveryTimeSeconds').lean(),
          Rider.countDocuments({ status: { $in: ['online', 'busy', 'idle'] } }),
          Rider.countDocuments({ status: 'busy' }),
          OpsIncident.countDocuments({ status: 'ongoing', cityId }),
          Order.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),
          Rider.countDocuments({}),
        ]);

      orderFlowPerHour = lastHourOrders ?? 0;
      orderFlowTrend = prevHourOrders > 0
        ? Math.round(((lastHourOrders - prevHourOrders) / prevHourOrders) * 100)
        : 0;

      if (deliveredOrders.length > 0) {
        const total = deliveredOrders.reduce((sum, o) => sum + (o.deliveryTimeSeconds || 0), 0);
        avgDeliveryTimeSeconds = Math.round(total / deliveredOrders.length);
      }

      activeRiders = activeRidersCount ?? 0;
      riderUtilizationPercent = activeRiders > 0
        ? Math.round((busyRidersCount / activeRiders) * 100)
        : 0;
      activeIncidentsCount = incidentsCount ?? 0;
      totalOrdersLast24h = orders24h ?? 0;
      totalRiders = ridersTotal ?? 0;
    } catch (err) {
      logger.warn('Citywide getLiveMetrics: partial failure from Order/Rider', { error: err.message });
    }

    return {
      orderFlowPerHour,
      orderFlowTrend,
      avgDeliveryTime: formatDeliveryTime(avgDeliveryTimeSeconds),
      avgDeliverySeconds: avgDeliveryTimeSeconds,
      targetDeliverySeconds: targetSeconds,
      targetDeliveryFormatted: formatDeliveryTime(targetSeconds),
      activeRiders,
      riderUtilizationPercent,
      activeIncidentsCount,
      totalOrdersLast24h,
      totalRiders,
      lastUpdated: now.toISOString(),
    };
  } catch (error) {
    logger.error('Citywide getLiveMetrics failed', { error: error.message });
    throw error;
  }
}

/**
 * Get zones with live metrics for heatmap
 */
async function getZonesWithMetrics(cityId = DEFAULT_CITY_ID) {
  try {
    const zones = await Zone.find({ isVisible: true }).sort({ createdAt: 1 }).lean();
    const surgeConfig = await OpsSurgeConfig.findOne({ cityId }).lean();
    const zoneMultipliers = surgeConfig?.zoneMultipliers || {};

    const result = [];
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const zoneName = z.name;
      const zoneId = z._id?.toString() || `zone-${i + 1}`;

      let activeOrders = 0;
      let activeRiders = 0;
      let avgDeliveryTimeSeconds = 0;
      let slaBreachCount = 0;

      try {
        const [orderStats, riderCount, deliveredInZone, breachCount] = await Promise.all([
          Order.countDocuments({
            zone: zoneName,
            status: { $in: ['assigned', 'picked_up', 'in_transit', 'delayed', 'pending'] },
          }),
          Rider.countDocuments({ zone: zoneName, status: { $in: ['online', 'busy', 'idle'] } }),
          Order.find({
            zone: zoneName,
            status: 'delivered',
            completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            deliveryTimeSeconds: { $exists: true, $ne: null },
          }).select('deliveryTimeSeconds').lean(),
          Order.countDocuments({
            zone: zoneName,
            $or: [
              { status: 'delayed' },
              { status: { $nin: ['delivered'] }, slaDeadline: { $lt: new Date() } },
            ],
          }),
        ]);

        activeOrders = orderStats ?? 0;
        activeRiders = riderCount ?? 0;
        slaBreachCount = breachCount ?? 0;

        if (deliveredInZone.length > 0) {
          const total = deliveredInZone.reduce((sum, o) => sum + (o.deliveryTimeSeconds || 0), 0);
          avgDeliveryTimeSeconds = Math.round(total / deliveredInZone.length);
        }
      } catch (err) {
        logger.warn('Citywide zone metrics partial failure', { zone: zoneName, error: err.message });
      }

      const capacityPercent = Math.min(100, Math.round(activeOrders * 2 + (activeRiders === 0 && activeOrders > 0 ? 50 : 0)));
      const riderStatus = activeRiders < activeOrders / 3 ? 'overload' : activeRiders > activeOrders ? 'normal' : 'normal';
      const slaStatus = slaBreachCount > 0 ? 'breach' : capacityPercent >= 85 ? 'warning' : 'on_track';
      let status = 'normal';
      if (capacityPercent >= 95 || slaBreachCount > 2) status = 'critical';
      else if (capacityPercent >= 80 || slaBreachCount > 0) status = 'warning';
      else if (zoneMultipliers[zoneId] > 1) status = 'surge';

      const stores = await Store.find({ zones: zoneName }).lean();
      const zoneStores = stores.map((s) => ({
        storeId: s._id?.toString() || s.name,
        storeName: s.name,
        status: s.serviceStatus === 'Full' ? 'active' : s.serviceStatus === 'Partial' ? 'limited' : 'offline',
        capacityPercent: 70,
        activeOrders: Math.floor(activeOrders / (stores.length || 1)),
      }));

      result.push({
        id: zoneId,
        zoneNumber: i + 1,
        zoneName,
        status,
        capacityPercent: capacityPercent || 20,
        activeOrders,
        activeRiders,
        riderStatus,
        avgDeliveryTime: formatDeliveryTime(avgDeliveryTimeSeconds) || '12m 00s',
        slaStatus,
        surgeMultiplier: zoneMultipliers[zoneId] || (surgeConfig?.active ? surgeConfig?.globalMultiplier : undefined),
        stores: zoneStores,
      });
    }

    return result;
  } catch (error) {
    logger.error('Citywide getZonesWithMetrics failed', { error: error.message });
    throw error;
  }
}

/**
 * Get zone detail by id
 */
async function getZoneDetail(zoneId, cityId = DEFAULT_CITY_ID) {
  const zone = await Zone.findById(zoneId).lean();
  if (!zone) return null;

  const zones = await getZonesWithMetrics(cityId);
  const found = zones.find((z) => z.id === zoneId || z.id === zone._id?.toString());
  return found || zones[0] || null;
}

/**
 * Get zone order trend (last 12 hours)
 */
async function getZoneOrderTrend(zoneId, cityId = DEFAULT_CITY_ID) {
  const zone = await Zone.findById(zoneId).lean();
  if (!zone) return [];

  const zones = await getZonesWithMetrics(cityId);
  const zoneData = zones.find((z) => z.id === zoneId || z.id === zone._id?.toString());
  const zoneName = zoneData?.zoneName || zone.name;

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const result = [];
  for (let h = 11; h >= 0; h--) {
    const hourStart = new Date(now.getTime() - h * 60 * 60 * 1000);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
    const count = await Order.countDocuments({
      zone: zoneName,
      createdAt: { $gte: hourStart, $lt: hourEnd },
    });
    const label = h === 0 ? 'now' : `${h}h ago`;
    result.push({ time: label, orders: count });
  }
  return result;
}

/**
 * Get incidents
 */
async function getIncidents(cityId = DEFAULT_CITY_ID, status = 'ongoing') {
  const filter = { cityId };
  if (status) filter.status = status;
  const incidents = await OpsIncident.find(filter).sort({ startTime: -1 }).lean();
  return incidents.map((inc) => ({
    id: inc._id.toString(),
    type: inc.type,
    severity: inc.severity,
    title: inc.title,
    description: inc.description,
    startTime: inc.startTime,
    duration: inc.resolvedAt ? `${Math.round((inc.resolvedAt - inc.startTime) / 60000)} mins` : undefined,
    impact: inc.impact,
    affectedOrders: inc.affectedOrders,
    affectedCustomers: inc.affectedCustomers,
    status: inc.status,
    resolvedAt: inc.resolvedAt,
    storeId: inc.storeId || null,
    storeName: inc.storeName || null,
    outageReason: inc.outageReason || null,
    timeline: inc.timeline || [],
    actions: inc.actions || [],
  }));
}

/**
 * Get incident by id
 */
async function getIncidentById(incidentId) {
  const inc = await OpsIncident.findById(incidentId).lean();
  if (!inc) return null;
  return {
    id: inc._id.toString(),
    ...inc,
    timeline: inc.timeline || [],
    actions: inc.actions || [],
  };
}

/**
 * Update incident
 */
async function updateIncident(incidentId, update, userId) {
  const inc = await OpsIncident.findByIdAndUpdate(
    incidentId,
    { ...update, $set: { updatedAt: new Date() } },
    { new: true }
  );
  if (!inc) return null;
  return inc;
}

/**
 * Get exceptions (open)
 */
async function getExceptions(cityId = DEFAULT_CITY_ID, limit = 20) {
  const list = await OpsException.find({ status: 'open', cityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return list.map((e) => ({
    id: e._id.toString(),
    type: e.type,
    orderId: `#${e.orderId}`,
    title: e.title,
    description: e.description,
    riderName: e.riderName,
    storeName: e.storeName,
    timestamp: e.createdAt,
    timeAgo: `${Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 60000)}m ago`,
    priority: e.priority,
  }));
}

/**
 * Resolve exception
 */
async function resolveException(exceptionId, resolution, userId) {
  const exc = await OpsException.findByIdAndUpdate(
    exceptionId,
    {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: userId || 'system',
      resolution: resolution || 'Resolved via dashboard',
    },
    { new: true }
  );
  return exc;
}

/**
 * Get integration health (outage management)
 */
async function getIntegrationHealth(cityId = DEFAULT_CITY_ID) {
  const integrations = await OpsIntegrationHealth.find({ cityId }).lean();
  const storeOutages = await OpsIncident.find({
    cityId,
    type: 'store_outage',
    status: 'ongoing',
  }).lean();

  return {
    integrations: integrations.map((i) => ({
      id: i._id.toString(),
      serviceKey: i.serviceKey,
      displayName: i.displayName,
      provider: i.provider,
      status: i.status,
      lastCheckedAt: i.lastCheckedAt,
      message: i.message,
    })),
    storeOutages: storeOutages.map((o) => ({
      id: o._id.toString(),
      storeId: o.storeId,
      storeName: o.storeName,
      outageReason: o.outageReason,
      estimatedResolution: o.estimatedResolution,
    })),
  };
}

/**
 * Get surge config
 */
async function getSurgeConfig(cityId = DEFAULT_CITY_ID) {
  let config = await OpsSurgeConfig.findOne({ cityId }).lean();
  if (!config) {
    config = { active: false, globalMultiplier: 1.0, zoneMultipliers: {}, startTime: null, estimatedEnd: null, reason: null };
  }
  return {
    active: config.active ?? false,
    globalMultiplier: config.globalMultiplier ?? 1.0,
    zonesAffected: Object.keys(config.zoneMultipliers || {}),
    zoneMultipliers: config.zoneMultipliers || {},
    startTime: config.startTime,
    estimatedEnd: config.estimatedEnd,
    reason: config.reason,
  };
}

/**
 * Update surge config
 */
async function updateSurgeConfig(cityId, update, userId) {
  const { zoneId, multiplier, ...rest } = update;
  const current = await OpsSurgeConfig.findOne({ cityId }).lean();
  const setUpdate = { updatedBy: userId, updatedAt: new Date(), ...rest };

  if (zoneId != null && multiplier != null) {
    const zoneMultipliers = { ...(current?.zoneMultipliers || {}) };
    zoneMultipliers[zoneId] = multiplier;
    setUpdate.zoneMultipliers = zoneMultipliers;
    setUpdate.active = Object.values(zoneMultipliers).some((m) => m > 1) || (rest.globalMultiplier > 1);
  }

  const nextMultiplier = rest.globalMultiplier ?? current?.globalMultiplier ?? 1.0;
  const willBeActive = rest.active === true || nextMultiplier > 1 || setUpdate.active === true;
  if (willBeActive && nextMultiplier > 1) {
    setUpdate.active = true;
    if (!current?.active || !current?.startTime) {
      setUpdate.startTime = new Date();
      setUpdate.estimatedEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
      if (!setUpdate.reason && !current?.reason) {
        setUpdate.reason = 'Peak demand';
      }
    }
  }

  await OpsSurgeConfig.findOneAndUpdate(
    { cityId },
    { $set: setUpdate },
    { new: true, upsert: true }
  );
  return getSurgeConfig(cityId);
}

/**
 * Increase global surge multiplier by 0.1x (max 2.0x)
 */
async function increaseSurgePricing(cityId, userId) {
  const current = await OpsSurgeConfig.findOne({ cityId }).lean();
  const currentMult = current?.globalMultiplier ?? 1.0;
  const newMult = Math.min(2.0, Math.round((currentMult + 0.1) * 10) / 10);
  return updateSurgeConfig(cityId, { globalMultiplier: newMult, active: true }, userId);
}

/**
 * Notify active customers about active surge pricing
 */
async function notifySurgeCustomers(cityId, userId) {
  const config = await getSurgeConfig(cityId);
  if (!config.active || config.globalMultiplier <= 1) {
    const err = new Error('Activate surge pricing before notifying customers');
    err.statusCode = 400;
    throw err;
  }

  const title = 'Surge pricing in effect';
  const body = `Delivery fees may be slightly higher (${config.globalMultiplier.toFixed(1)}x) due to high demand in your area.`;

  const users = await CustomerUser.find({ status: 'active' }).select('_id').limit(500).lean();
  if (users.length > 0) {
    const notifications = users.map((u) => ({
      userId: u._id,
      title,
      body,
      data: { type: 'surge_pricing', multiplier: config.globalMultiplier, cityId },
      read: false,
    }));
    await Notification.insertMany(notifications);
  }

  websocketService.broadcastToRole('customer', 'surge:notification', {
    title,
    body,
    multiplier: config.globalMultiplier,
    cityId,
  });

  logger.info('Surge customer notifications sent', { cityId, count: users.length, userId });
  return { sent: users.length, surgeInfo: config };
}

/**
 * Notify online riders about surge period
 */
async function notifySurgeRiders(cityId, userId) {
  const config = await getSurgeConfig(cityId);
  if (!config.active || config.globalMultiplier <= 1) {
    const err = new Error('Activate surge pricing before notifying riders');
    err.statusCode = 400;
    throw err;
  }

  const title = 'Surge period active';
  const body = `High demand in your area — ${config.globalMultiplier.toFixed(1)}x delivery incentives may apply. Stay online to earn more.`;

  const riders = await Rider.find({ status: { $in: ['online', 'idle', 'busy'] } }).select('id').lean();

  websocketService.broadcastToRole('rider', 'surge:notification', {
    title,
    body,
    multiplier: config.globalMultiplier,
    cityId,
    zonesAffected: config.zonesAffected,
  });

  riders.forEach((rider) => {
    websocketService.broadcastToUser(rider.id, 'surge:notification', {
      title,
      body,
      multiplier: config.globalMultiplier,
      cityId,
    });
  });

  logger.info('Surge rider notifications sent', { cityId, count: riders.length, userId });
  return { sent: riders.length, surgeInfo: config };
}

/**
 * Execute a surge quick action
 */
async function executeSurgeAction(cityId, action, userId) {
  switch (action) {
    case 'increase_pricing':
      return { surgeInfo: await increaseSurgePricing(cityId, userId) };
    case 'notify_customers':
      return notifySurgeCustomers(cityId, userId);
    case 'notify_riders':
      return notifySurgeRiders(cityId, userId);
    default: {
      const err = new Error(`Unknown surge action: ${action}`);
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * End surge
 */
async function endSurge(cityId, userId) {
  await OpsSurgeConfig.findOneAndUpdate(
    { cityId },
    { active: false, globalMultiplier: 1.0, zoneMultipliers: {}, updatedBy: userId, updatedAt: new Date() },
    { upsert: true }
  );
  return getSurgeConfig(cityId);
}

/**
 * Get dispatch config
 */
async function getDispatchConfig(cityId = DEFAULT_CITY_ID) {
  let config = await OpsDispatchConfig.findOne({ cityId }).lean();
  if (!config) {
    config = {
      status: 'running',
      lastRestart: new Date(),
      slaTargetMinutes: 15,
      config: { algorithm: 'nearest_available', riderSelection: 'proximity', batchingEnabled: true, surgePricingEnabled: true },
    };
  }
  const uptime = config.lastRestart ? Math.floor((Date.now() - new Date(config.lastRestart).getTime()) / 60000) : 0;
  let processingOrders = 0;
  try {
    processingOrders = await Order.countDocuments({ status: 'pending' });
  } catch (err) {
    logger.warn('Failed to count pending orders for dispatch config', { err: err.message });
  }
  return {
    status: config.status || 'running',
    lastRestart: config.lastRestart,
    uptime: `${uptime} mins`,
    uptimePercent: 99,
    processingOrders,
    avgDispatchTime: 45,
    successRate: 99,
    configuration: config.config || {
      algorithm: 'nearest_available',
      riderSelection: 'proximity',
      batchingEnabled: true,
      surgePricingEnabled: true,
    },
  };
}

/**
 * Update dispatch config (pause/resume)
 */
async function updateDispatchConfig(cityId, update, userId) {
  const current = await OpsDispatchConfig.findOne({ cityId }).lean();
  const mergedConfig = {
    ...(current?.config || {}),
    ...(update?.config || {}),
  };
  const nextStatus = update?.status || current?.status || 'running';
  const setUpdate = {
    ...(current || {}),
    ...update,
    config: mergedConfig,
    status: nextStatus,
    updatedBy: userId,
    updatedAt: new Date(),
    lastRestart: nextStatus === 'running' ? new Date() : current?.lastRestart,
  };
  await OpsDispatchConfig.findOneAndUpdate(
    { cityId },
    { $set: setUpdate },
    { new: true, upsert: true }
  );

  if (update?.status && update.status !== current?.status) {
    const action = update.status === 'paused' ? 'pause' : 'resume';
    await appendDispatchLog(cityId, {
      action,
      message: `Dispatch engine ${action === 'pause' ? 'paused' : 'resumed'}`,
      status: nextStatus,
      userId,
    });
  } else if (update?.config && Object.keys(update.config).length > 0) {
    await appendDispatchLog(cityId, {
      action: 'config_update',
      message: 'Dispatch configuration updated',
      status: nextStatus,
      userId,
    });
  }

  return getDispatchConfig(cityId);
}

/**
 * Restart dispatch engine
 */
async function restartDispatch(cityId, userId) {
  await OpsDispatchConfig.findOneAndUpdate(
    { cityId },
    { status: 'running', lastRestart: new Date(), updatedBy: userId, updatedAt: new Date() },
    { new: true, upsert: true }
  );
  await appendDispatchLog(cityId, {
    action: 'restart',
    message: 'Dispatch engine restarted',
    status: 'running',
    userId,
  });
  return getDispatchConfig(cityId);
}

/**
 * Manual override — force pause or resume regardless of current state
 */
async function manualOverrideDispatch(cityId, { status, reason }, userId) {
  const targetStatus = status === 'paused' ? 'paused' : 'running';
  await OpsDispatchConfig.findOneAndUpdate(
    { cityId },
    {
      status: targetStatus,
      updatedBy: userId,
      updatedAt: new Date(),
      ...(targetStatus === 'running' ? { lastRestart: new Date() } : {}),
    },
    { upsert: true }
  );
  await appendDispatchLog(cityId, {
    action: 'manual_override',
    message: reason?.trim() || `Manual override: forced ${targetStatus}`,
    status: targetStatus,
    userId,
  });
  return getDispatchConfig(cityId);
}

/**
 * Get dispatch engine activity logs
 */
async function getDispatchLogs(cityId = DEFAULT_CITY_ID, limit = 50) {
  const config = await OpsDispatchConfig.findOne({ cityId }).lean();
  const logs = (config?.activityLog || []).slice(0, limit);
  return logs.map((log, index) => ({
    id: `${cityId}-${index}-${new Date(log.timestamp).getTime()}`,
    timestamp: log.timestamp,
    action: log.action,
    message: log.message,
    status: log.status,
    userId: log.userId,
  }));
}

/**
 * Get SLA config
 */
async function getSlaConfig(cityId = DEFAULT_CITY_ID) {
  const config = await OpsSlaConfig.findOne({ cityId }).lean();
  return {
    targetMinutes: config?.targetMinutes ?? 15,
    zoneOverrides: config?.zoneOverrides || {},
  };
}

/**
 * Seed minimal zone data for heatmap when none exist
 */
async function ensureZonesExist() {
  const count = await Zone.countDocuments({ isVisible: true });
  if (count > 0) return;

  const defaultZones = [
    { name: 'Indiranagar', type: 'standard', status: 'active', isVisible: true, city: 'Bangalore', color: '#10B981' },
    { name: 'Whitefield', type: 'standard', status: 'active', isVisible: true, city: 'Bangalore', color: '#3B82F6' },
    { name: 'Koramangala', type: 'premium', status: 'active', isVisible: true, city: 'Bangalore', color: '#8B5CF6' },
    { name: 'HSR Layout', type: 'standard', status: 'active', isVisible: true, city: 'Bangalore', color: '#F59E0B' },
  ];
  await Zone.insertMany(defaultZones);
}

/**
 * Seed minimal test data for Citywide Control
 */
async function seedCitywideData(cityId = DEFAULT_CITY_ID) {
  await ensureZonesExist();

  await OpsIntegrationHealth.deleteMany({ cityId });
  await OpsIntegrationHealth.insertMany([
    { serviceKey: 'payment_razorpay', displayName: 'Razorpay', provider: 'Payment Gateway', status: 'stable', cityId },
    { serviceKey: 'maps_google', displayName: 'Google Maps', provider: 'Maps API', status: 'latency', message: 'Latency: 2.3s (threshold: 1s)', cityId },
  ]);

  await OpsSlaConfig.findOneAndUpdate({ cityId }, { targetMinutes: 15, cityId }, { upsert: true });
  await OpsDispatchConfig.findOneAndUpdate(
    { cityId },
    { status: 'running', slaTargetMinutes: 15, cityId, config: { algorithm: 'nearest_available', riderSelection: 'proximity', batchingEnabled: true, surgePricingEnabled: true } },
    { upsert: true }
  );
  await OpsSurgeConfig.findOneAndUpdate(
    { cityId },
    { active: true, globalMultiplier: 1.5, zoneMultipliers: {}, cityId, startTime: new Date(), reason: 'Peak hours' },
    { upsert: true }
  );

  const incidentCount = await OpsIncident.countDocuments({ cityId });
  if (incidentCount === 0) {
    await OpsIncident.create({
      incidentNumber: 'INC-001',
      type: 'store_outage',
      severity: 'critical',
      title: 'Store Outage',
      description: 'ST-102 (Power Failure)',
      startTime: new Date(Date.now() - 15 * 60 * 1000),
      status: 'ongoing',
      impact: '7 orders affected | 89 customers impacted',
      affectedOrders: 7,
      affectedCustomers: 89,
      storeId: 'ST-102',
      storeName: 'ST-102',
      outageReason: 'Power Failure',
      cityId,
      timeline: [
        { timestamp: new Date(Date.now() - 15 * 60 * 1000), event: 'Incident detected' },
        { timestamp: new Date(Date.now() - 10 * 60 * 1000), event: 'Customers notified' },
      ],
      actions: [
        { id: 'a1', label: 'Call Store Manager', type: 'primary' },
        { id: 'a2', label: 'Reassign Orders', type: 'secondary' },
      ],
    });
  }

  const exceptionCount = await OpsException.countDocuments({ cityId, status: 'open' });
  if (exceptionCount === 0) {
    await OpsException.insertMany([
      { exceptionNumber: 'EXP-001', type: 'rto_risk', orderId: '88219', title: 'Customer unreachable', description: 'Multiple delivery attempts failed', riderName: 'Amit K.', storeName: 'Indiranagar', priority: 'high', status: 'open', cityId },
      { exceptionNumber: 'EXP-002', type: 'pickup_delay', orderId: '88218', title: 'Warehouse pickup delayed', description: 'Order pending for >15 mins', riderName: 'Rajesh M.', storeName: 'Whitefield', priority: 'medium', status: 'open', cityId },
    ]);
  }

  return { ok: true, message: 'Citywide seed completed' };
}

module.exports = {
  getLiveMetrics,
  getZonesWithMetrics,
  getZoneDetail,
  getZoneOrderTrend,
  getIncidents,
  getIncidentById,
  updateIncident,
  getExceptions,
  resolveException,
  getIntegrationHealth,
  getSurgeConfig,
  updateSurgeConfig,
  increaseSurgePricing,
  notifySurgeCustomers,
  notifySurgeRiders,
  executeSurgeAction,
  endSurge,
  getDispatchConfig,
  updateDispatchConfig,
  restartDispatch,
  manualOverrideDispatch,
  getDispatchLogs,
  getSlaConfig,
  seedCitywideData,
};
