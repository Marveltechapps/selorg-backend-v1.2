const Zone = require('../models/Zone');
const ZoneAudit = require('../models/ZoneAudit');
const Store = require('../models/Store');
const City = require('../models/City');
const Campaign = require('../models/Campaign');
const { PricingCoupon } = require('../models/PricingCoupon');
const Order = require('../../warehouse/models/Order');
const Rider = require('../../rider/models/Rider');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// Map legacy type/status to Admin Geofence format
const TYPE_TO_ADMIN = {
  Serviceable: 'standard',
  Exclusion: 'no-service',
  Priority: 'premium',
  'Promo-Only': 'express',
  standard: 'standard',
  express: 'express',
  'no-service': 'no-service',
  premium: 'premium',
  surge: 'surge',
};
const STATUS_TO_ADMIN = {
  Active: 'active',
  Inactive: 'inactive',
  Pending: 'testing',
  active: 'active',
  inactive: 'inactive',
  testing: 'testing',
};

const DEFAULT_SETTINGS = {
  deliveryFee: 39,
  minOrderValue: 149,
  maxDeliveryRadius: 5,
  estimatedDeliveryTime: 30,
  surgeMultiplier: 1.0,
  maxCapacity: 100,
  priority: 5,
  availableSlots: ['08:00-22:00'],
};

const DEFAULT_ANALYTICS = {
  areaSize: 0,
  population: 0,
  activeOrders: 0,
  totalOrders: 0,
  dailyOrders: 0,
  revenue: 0,
  avgDeliveryTime: 0,
  riderCount: 0,
  capacityUsage: 0,
  customerSatisfaction: 0,
};

const ACTIVE_ORDER_STATUSES = ['assigned', 'picked_up', 'in_transit', 'delayed', 'pending'];

function polygonAreaSqKm(polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  const meanLatRad =
    (polygon.reduce((sum, p) => sum + Number(p.lat || 0), 0) / polygon.length) * (Math.PI / 180);
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(meanLatRad);
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const x1 = Number(curr.lng || 0) * kmPerDegLng;
    const y1 = Number(curr.lat || 0) * kmPerDegLat;
    const x2 = Number(next.lng || 0) * kmPerDegLng;
    const y2 = Number(next.lat || 0) * kmPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Number((Math.abs(area) / 2).toFixed(2));
}

async function buildComputedAnalytics(zoneLike) {
  const zoneName = zoneLike?.name;
  const settings = { ...DEFAULT_SETTINGS, ...(zoneLike?.settings || {}) };
  const fallbackAnalytics = { ...DEFAULT_ANALYTICS, ...(zoneLike?.analytics || {}) };
  if (!zoneName) {
    const areaSizeFallback = polygonAreaSqKm(zoneLike?.polygon);
    return {
      ...fallbackAnalytics,
      areaSize: areaSizeFallback || fallbackAnalytics.areaSize || 0,
      capacityUsage: settings.maxCapacity > 0
        ? Math.min(100, Math.round(((fallbackAnalytics.activeOrders || 0) / settings.maxCapacity) * 100))
        : 0,
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [activeOrders, totalOrders, dailyOrders, deliveredStats, riderCount] = await Promise.all([
    Order.countDocuments({ zone: zoneName, status: { $in: ACTIVE_ORDER_STATUSES } }),
    Order.countDocuments({ zone: zoneName }),
    Order.countDocuments({ zone: zoneName, createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: { zone: zoneName, status: 'delivered' } },
      {
        $group: {
          _id: null,
          avgDeliveryTime: { $avg: { $ifNull: ['$deliveryTimeSeconds', 0] } },
          revenue: {
            $sum: {
              $ifNull: [
                '$total_bill',
                { $ifNull: ['$totalBill', { $ifNull: ['$amount', 0] }] },
              ],
            },
          },
        },
      },
    ]),
    Rider.countDocuments({ zone: zoneName, status: { $in: ['online', 'busy', 'idle'] } }),
  ]);

  const areaSize = polygonAreaSqKm(zoneLike?.polygon) || Number(zoneLike?.areaSqKm || 0);
  const avgDeliveryTimeSeconds = Number(deliveredStats?.[0]?.avgDeliveryTime || 0);
  const capacityUsage = settings.maxCapacity > 0
    ? Math.min(100, Math.round((activeOrders / settings.maxCapacity) * 100))
    : 0;

  return {
    ...fallbackAnalytics,
    areaSize,
    activeOrders,
    totalOrders,
    dailyOrders,
    revenue: Number(deliveredStats?.[0]?.revenue || 0),
    avgDeliveryTime: Math.round(avgDeliveryTimeSeconds / 60),
    riderCount,
    capacityUsage,
  };
}

// Convert points [{x,y}] to polygon [{lat,lng}] (approximate, for legacy zones)
function pointsToPolygon(points, centerLat = 19.076, centerLng = 72.8777) {
  if (!points || points.length < 3) return [{ lat: centerLat, lng: centerLng }];
  const scale = 0.01;
  return points.map((p) => ({
    lat: centerLat + (p.y - 50) * scale,
    lng: centerLng + (p.x - 50) * scale,
  }));
}

function zoneToGeofenceZone(z) {
  const polygon = (z.polygon && z.polygon.length >= 3)
    ? z.polygon
    : pointsToPolygon(z.points);
  const center = z.center || (polygon.length > 0
    ? {
        lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
        lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length,
      }
    : { lat: 19.076, lng: 72.8777 });
  const settings = { ...DEFAULT_SETTINGS, ...(z.settings || {}) };
  const analytics = { ...DEFAULT_ANALYTICS, ...(z.analytics || {}) };
  if (z.areaSqKm != null && analytics.areaSize === 0) analytics.areaSize = z.areaSqKm;
  return {
    id: z._id.toString(),
    name: z.name,
    city: z.city || (z.cityId && z.cityId.name ? z.cityId.name : 'Unknown'),
    region: z.region || 'Central',
    type: TYPE_TO_ADMIN[z.type] || z.type || 'standard',
    status: STATUS_TO_ADMIN[z.status] || z.status || 'active',
    isVisible: z.isVisible !== false,
    color: z.color || '#3b82f6',
    areaSqKm: z.areaSqKm ?? (z.analytics && z.analytics.areaSize),
    polygon,
    center,
    settings,
    analytics,
    createdAt: z.createdAt?.toISOString?.() || z.createdAt,
    updatedAt: z.updatedAt?.toISOString?.() || z.updatedAt,
    createdBy: z.createdBy || 'system',
  };
}

function buildZoneFromBody(body, existing) {
  const zone = existing ? existing.toObject ? existing.toObject() : { ...existing } : {};
  const updates = {};
  if (body.name != null) updates.name = String(body.name).trim();
  if (body.city != null) updates.city = String(body.city);
  if (body.region != null) updates.region = String(body.region);
  if (body.type != null) updates.type = body.type;
  if (body.status != null) updates.status = body.status;
  if (body.color != null) updates.color = body.color;
  if (body.isVisible != null) updates.isVisible = Boolean(body.isVisible);
  if (body.areaSqKm != null) updates.areaSqKm = Number(body.areaSqKm);
  if (body.polygon != null && Array.isArray(body.polygon) && body.polygon.length >= 3) {
    updates.polygon = body.polygon.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
  }
  if (body.center != null) {
    updates.center = { lat: Number(body.center.lat), lng: Number(body.center.lng) };
  }
  if (body.settings != null && typeof body.settings === 'object') {
    updates.settings = { ...(zone.settings || DEFAULT_SETTINGS), ...body.settings };
  }
  if (body.analytics != null && typeof body.analytics === 'object') {
    updates.analytics = { ...(zone.analytics || DEFAULT_ANALYTICS), ...body.analytics };
  }
  if (body.createdBy != null) updates.createdBy = body.createdBy;
  if (body.points != null && Array.isArray(body.points) && body.points.length >= 3) {
    updates.polygon = pointsToPolygon(body.points, 19.076, 72.8777);
  }
  if (updates.polygon && updates.polygon.length >= 3) {
    updates.areaSqKm = polygonAreaSqKm(updates.polygon);
    updates.analytics = {
      ...(updates.analytics || zone.analytics || DEFAULT_ANALYTICS),
      areaSize: updates.areaSqKm,
    };
  }
  return { ...zone, ...updates };
}

const getCityCode = (name = '') => {
  const normalized = String(name).replace(/[^a-zA-Z]/g, '').toUpperCase();
  return (normalized.slice(0, 3) || 'CTY').padEnd(3, 'X');
};

const resolveCityId = async (body, existingZone = null) => {
  if (body?.cityId) return body.cityId;
  if (existingZone?.cityId) return existingZone.cityId;

  const cityName = String(body?.city || '').trim();
  if (!cityName) return null;

  const existingCity = await City.findOne({
    name: { $regex: `^${cityName}$`, $options: 'i' },
  }).lean();
  if (existingCity?._id) return existingCity._id;

  const created = await City.create({
    name: cityName,
    code: getCityCode(cityName),
    country: 'India',
    isActive: true,
  });
  return created._id;
};

// @desc    Get all zones (Admin Geofence format)
// @route   GET /api/v1/merch/geofence/zones
const getZones = async (req, res, next) => {
  try {
    const zones = await Zone.find().sort({ createdAt: -1 }).populate('cityId', 'name').lean();
    const withComputed = await Promise.all(
      zones.map(async (z) => {
        const computedAnalytics = await buildComputedAnalytics(z);
        const computedArea = polygonAreaSqKm(z.polygon) || z.areaSqKm || 0;
        return {
          ...z,
          areaSqKm: computedArea,
          analytics: computedAnalytics,
        };
      })
    );
    if (withComputed.length > 0) {
      await Zone.bulkWrite(
        withComputed.map((z) => ({
          updateOne: {
            filter: { _id: z._id },
            update: {
              $set: {
                areaSqKm: z.areaSqKm,
                analytics: z.analytics,
              },
            },
          },
        }))
      );
    }
    const data = withComputed.map((z) => zoneToGeofenceZone(z));
    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single zone by id (for clone)
// @route   GET /api/v1/merch/geofence/zones/:id
const getZoneById = async (req, res, next) => {
  try {
    const zone = await Zone.findById(req.params.id).populate('cityId', 'name').lean();
    if (!zone) {
      return next(new ErrorResponse(`Zone not found with id of ${req.params.id}`, 404));
    }
    const computedAnalytics = await buildComputedAnalytics(zone);
    const computedArea = polygonAreaSqKm(zone.polygon) || zone.areaSqKm || 0;
    await Zone.findByIdAndUpdate(zone._id, {
      analytics: computedAnalytics,
      areaSqKm: computedArea,
    });
    res.status(200).json({
      success: true,
      data: zoneToGeofenceZone({ ...zone, analytics: computedAnalytics, areaSqKm: computedArea }),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new zone
// @route   POST /api/v1/merch/geofence/zones
const createZone = async (req, res, next) => {
  try {
    const cityId = await resolveCityId(req.body, null);
    if (!cityId) {
      return next(new ErrorResponse('Unable to resolve cityId. Provide city or cityId in request.', 400));
    }
    const body = buildZoneFromBody(req.body, null);
    body.cityId = cityId;
    body.analytics = await buildComputedAnalytics(body);
    if (body.analytics?.areaSize) {
      body.areaSqKm = body.analytics.areaSize;
    }
    const zone = await Zone.create(body);
    const performedBy = req.user?.email || req.body?.createdBy || 'admin';
    await ZoneAudit.create({
      zoneId: zone._id,
      zoneName: zone.name,
      action: 'created',
      changes: `Zone created with polygon (${(zone.polygon || []).length} points)`,
      performedBy,
    });
    const doc = await Zone.findById(zone._id).populate('cityId', 'name').lean();
    res.status(201).json({ success: true, data: zoneToGeofenceZone(doc) });
  } catch (err) {
    next(err);
  }
};

// @desc    Update zone
// @route   PUT /api/v1/merch/geofence/zones/:id
const updateZone = async (req, res, next) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) {
      return next(new ErrorResponse(`Zone not found with id of ${req.params.id}`, 404));
    }
    const cityId = await resolveCityId(req.body, zone);
    if (!cityId) {
      return next(new ErrorResponse('Unable to resolve cityId. Provide city or cityId in request.', 400));
    }
    const body = buildZoneFromBody(req.body, zone);
    body.cityId = cityId;
    const previousStatus = zone.status;
    Object.assign(zone, body);
    zone.analytics = await buildComputedAnalytics(zone);
    if (zone.analytics?.areaSize) {
      zone.areaSqKm = zone.analytics.areaSize;
    }
    await zone.save();

    const action = body.status !== previousStatus
      ? (body.status === 'active' || body.status === 'Active' ? 'activated' : 'deactivated')
      : 'updated';
    const performedBy = req.user?.email || req.body?.createdBy || 'admin';
    await ZoneAudit.create({
      zoneId: zone._id,
      zoneName: zone.name,
      action,
      changes: body.polygon ? `Polygon updated (${body.polygon.length} points)` : 'Zone details updated',
      performedBy,
    });

    const doc = await Zone.findById(zone._id).populate('cityId', 'name').lean();
    res.status(200).json({ success: true, data: zoneToGeofenceZone(doc) });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete zone
// @route   DELETE /api/v1/merch/geofence/zones/:id
const deleteZone = async (req, res, next) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) {
      return next(new ErrorResponse(`Zone not found with id of ${req.params.id}`, 404));
    }
    const zoneName = zone.name;
    const zoneId = zone._id;
    await Zone.findByIdAndDelete(req.params.id);
    const performedBy = req.user?.email || 'admin';
    await ZoneAudit.create({
      zoneId,
      zoneName,
      action: 'deleted',
      changes: 'Zone deleted',
      performedBy,
    });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Get zone history
// @route   GET /api/v1/merch/geofence/history
const getHistory = async (req, res, next) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const audits = await ZoneAudit.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const data = audits.map((a) => ({
      id: a._id.toString(),
      zoneId: a.zoneId?.toString(),
      zoneName: a.zoneName,
      action: a.action,
      changes: a.changes,
      timestamp: a.createdAt?.toISOString?.() || a.createdAt,
      performedBy: a.performedBy,
    }));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

function pointInPolygon(point, polygon = []) {
  if (!polygon || polygon.length < 3) return false;
  const x = Number(point.lng);
  const y = Number(point.lat);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].lng);
    const yi = Number(polygon[i].lat);
    const xj = Number(polygon[j].lng);
    const yj = Number(polygon[j].lat);
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonsOverlap(polyA = [], polyB = []) {
  if (polyA.length < 3 || polyB.length < 3) return false;
  for (const p of polyA) {
    if (pointInPolygon(p, polyB)) return true;
  }
  for (const p of polyB) {
    if (pointInPolygon(p, polyA)) return true;
  }
  return false;
}

// @desc    Get overlap warnings between zone polygons
// @route   GET /api/v1/merch/geofence/overlaps
const getOverlaps = async (req, res, next) => {
  try {
    const zones = await Zone.find({ status: { $ne: 'deleted' } }).lean();
    const warnings = [];
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i];
        const b = zones[j];
        if (!polygonsOverlap(a.polygon, b.polygon)) continue;
        warnings.push({
          id: `${a._id}-${b._id}`,
          zoneA: a.name,
          zoneB: b.name,
          zoneAId: a._id.toString(),
          zoneBId: b._id.toString(),
          severity: 'warning',
          message: `${a.name} overlaps with ${b.name}`,
        });
      }
    }
    res.status(200).json({ success: true, data: warnings });
  } catch (err) {
    next(err);
  }
};

// @desc    Toggle zone status (active/inactive)
// @route   PATCH /api/v1/merch/geofence/zones/:id
const toggleZoneStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status || !['active', 'inactive'].includes(status)) {
      return next(new ErrorResponse('Status must be active or inactive', 400));
    }
    const zone = await Zone.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!zone) {
      return next(new ErrorResponse(`Zone not found with id of ${req.params.id}`, 404));
    }
    const performedBy = req.user?.email || 'admin';
    await ZoneAudit.create({
      zoneId: zone._id,
      zoneName: zone.name,
      action: status === 'active' ? 'activated' : 'deactivated',
      changes: `Status changed to ${status}`,
      performedBy,
    });
    const computedAnalytics = await buildComputedAnalytics(zone);
    await Zone.findByIdAndUpdate(zone._id, { analytics: computedAnalytics });
    const doc = await Zone.findById(zone._id).populate('cityId', 'name').lean();
    res.status(200).json({ success: true, data: zoneToGeofenceZone(doc) });
  } catch (err) {
    next(err);
  }
};

function orderRevenueExpr() {
  return {
    $ifNull: [
      '$total_bill',
      { $ifNull: ['$totalBill', { $ifNull: ['$amount', 0] }] },
    ],
  };
}

async function campaignRedemptionsForZone(zoneName, since) {
  const campaigns = await Campaign.find({
    status: { $in: ['Active', 'Scheduled'] },
    campaignCategory: { $in: ['promo', 'clearance'] },
    createdAt: { $gte: since },
    $or: [
      { target: { $regex: zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { scope: { $regex: zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { tagline: { $regex: zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ],
  }).lean();
  const orderSum = campaigns.reduce((sum, c) => sum + Number(c.performance?.orders ?? 0), 0);
  if (orderSum > 0) return orderSum;
  return campaigns.filter((c) => c.status === 'Active').length;
}

async function couponRedemptionsForZone(zoneName) {
  const coupons = await PricingCoupon.find({
    status: 'active',
    $or: [
      { targetZones: zoneName },
      { targetZones: { $size: 0 } },
      { targetZones: { $exists: false } },
    ],
  }).lean();
  return coupons.reduce((sum, c) => {
    const zones = c.targetZones || [];
    if (zones.length === 0) return sum + Math.round((c.usageCount ?? 0) / 10);
    if (zones.includes(zoneName)) return sum + Number(c.usageCount ?? 0);
    return sum;
  }, 0);
}

function isActiveZoneStatus(status) {
  const s = String(status ?? 'active').toLowerCase();
  return s === 'active' || s === 'testing';
}

function pickTopPromoZone(rows) {
  if (!rows?.length) {
    return { topPromoZone: '—', topPromoMetric: 'redemptions', topPromoValue: 0 };
  }
  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      orders: acc.orders + r.orders,
      redemptions: acc.redemptions + r.redemptions,
    }),
    { revenue: 0, orders: 0, redemptions: 0 },
  );
  const pickMax = (key) => rows.reduce((best, r) => (r[key] > best[key] ? r : best), rows[0]);
  if (totals.redemptions > 0) {
    const top = pickMax('redemptions');
    return { topPromoZone: top.zoneName, topPromoMetric: 'redemptions', topPromoValue: top.redemptions };
  }
  if (totals.revenue > 0) {
    const top = pickMax('revenue');
    return { topPromoZone: top.zoneName, topPromoMetric: 'revenue', topPromoValue: top.revenue };
  }
  if (totals.orders > 0) {
    const top = pickMax('orders');
    return { topPromoZone: top.zoneName, topPromoMetric: 'orders', topPromoValue: top.orders };
  }
  return { topPromoZone: rows[0].zoneName, topPromoMetric: 'redemptions', topPromoValue: 0 };
}

async function buildPromoHeatmapRows(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const zones = (await Zone.find().sort({ name: 1 }).lean())
    .filter((z) => z.isVisible !== false);
  const zoneNames = zones.map((z) => z.name).filter(Boolean);

  const orderAgg = zoneNames.length
    ? await Order.aggregate([
      { $match: { zone: { $in: zoneNames }, createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$zone',
          revenue: { $sum: orderRevenueExpr() },
          orders: { $sum: 1 },
        },
      },
    ])
    : [];

  const orderByZone = Object.fromEntries(orderAgg.map((r) => [r._id, r]));

  const rows = await Promise.all(zones.map(async (z) => {
    const analytics = await buildComputedAnalytics(z);
    const orderRow = orderByZone[z.name] || {};
    const revenue = Number(orderRow.revenue ?? analytics.revenue ?? 0);
    const orders = Number(orderRow.orders ?? analytics.dailyOrders ?? analytics.totalOrders ?? 0);
    const couponRedemptions = await couponRedemptionsForZone(z.name);
    const campaignRedemptions = await campaignRedemptionsForZone(z.name, since);
    const redemptions = couponRedemptions + campaignRedemptions;

    return {
      zoneId: z._id.toString(),
      zoneName: z.name,
      color: z.color || '#3b82f6',
      revenue,
      orders,
      redemptions,
      promoCount: Number(z.promoCount ?? 0),
      areaSqKm: polygonAreaSqKm(z.polygon) || Number(z.areaSqKm ?? 0),
    };
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      orders: acc.orders + r.orders,
      redemptions: acc.redemptions + r.redemptions,
    }),
    { revenue: 0, orders: 0, redemptions: 0 },
  );

  return { days, rows, totals };
}

// @desc    Geofence KPI stats (zones, coverage, top promo zone)
// @route   GET /api/v1/merch/geofence/stats
const getGeofenceStats = async (req, res, next) => {
  try {
    const heatmapDays = Math.min(90, Math.max(1, parseInt(req.query.heatmapDays, 10) || 30));
    const [zones, stores, heatmap] = await Promise.all([
      Zone.find().lean(),
      Store.find({
        $or: [
          { 'metadata.geofenceDemo': true },
          { serviceStatus: { $in: ['Full', 'Partial', 'None'] } },
          { x: { $exists: true } },
          { latitude: { $exists: true, $ne: null } },
        ],
      }).lean(),
      buildPromoHeatmapRows(heatmapDays),
    ]);

    const activeZones = zones.filter((z) => isActiveZoneStatus(z.status)).length;
    const totalArea = Math.round(
      zones.reduce((sum, z) => sum + (Number(z.areaSqKm) || polygonAreaSqKm(z.polygon) || 0), 0) * 100,
    ) / 100;

    const storesFullyCovered = stores.filter((s) => s.serviceStatus === 'Full').length;
    const storesPartial = stores.filter((s) => s.serviceStatus === 'Partial').length;
    const storesNone = stores.filter((s) => !s.serviceStatus || s.serviceStatus === 'None').length;
    const promoPick = pickTopPromoZone(heatmap.rows);

    res.status(200).json({
      success: true,
      data: {
        totalZones: zones.length,
        activeZones,
        inactiveZones: zones.length - activeZones,
        totalArea,
        storesTotal: stores.length,
        storesFullyCovered,
        storesPartial,
        storesNone,
        heatmapDays,
        heatmapTotals: heatmap.totals,
        ...promoPick,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Promo heatmap metrics per zone (revenue, orders, redemptions)
// @route   GET /api/v1/merch/geofence/heatmap
const getPromoHeatmap = async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const { rows, totals } = await buildPromoHeatmapRows(days);

    res.status(200).json({
      success: true,
      data: {
        days,
        periodLabel: `Last ${days} Days • All Campaigns`,
        rows,
        totals,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all stores
// @route   GET /api/v1/merch/geofence/stores
const getStores = async (req, res, next) => {
  try {
    const stores = await Store.find({
      $or: [
        { 'metadata.geofenceDemo': true },
        { serviceStatus: { $in: ['Full', 'Partial', 'None'] } },
        { x: { $exists: true } },
        { latitude: { $exists: true, $ne: null } },
      ],
    }).lean();
    res.status(200).json({ success: true, count: stores.length, data: stores });
  } catch (err) {
    next(err);
  }
};

// @desc    Update store zone assignment / service status
// @route   PUT /api/v1/merch/geofence/stores/:id
const updateStore = async (req, res, next) => {
  try {
    const patch = {};
    if (Array.isArray(req.body.zones)) patch.zones = req.body.zones.map(String);
    if (req.body.serviceStatus != null) patch.serviceStatus = req.body.serviceStatus;
    if (req.body.zoneId != null) patch.zoneId = req.body.zoneId;

    const store = await Store.findByIdAndUpdate(req.params.id, patch, {
      new: true,
      runValidators: false,
    });
    if (!store) {
      return next(new ErrorResponse(`Store not found with id of ${req.params.id}`, 404));
    }
    res.status(200).json({ success: true, data: store });
  } catch (err) {
    next(err);
  }
};

// @desc    Seed Geofence Data
// @route   POST /api/v1/merch/geofence/seed
const seedGeofenceData = async (req, res, next) => {
  try {
    let city = await City.findOne({ name: { $regex: '^Mumbai$', $options: 'i' } });
    if (!city) {
      city = await City.create({ name: 'Mumbai', code: 'MUM', country: 'India', isActive: true });
    }
    const mockZones = [
      {
        name: 'Downtown Core',
        type: 'standard',
        status: 'active',
        isVisible: true,
        color: '#10B981',
        areaSqKm: 12.4,
        city: 'Mumbai',
        cityId: city._id,
        region: 'West',
        polygon: [
          { lat: 19.076, lng: 72.8777 },
          { lat: 19.076, lng: 72.8877 },
          { lat: 19.066, lng: 72.8877 },
          { lat: 19.066, lng: 72.8777 },
        ],
        center: { lat: 19.071, lng: 72.8827 },
        settings: DEFAULT_SETTINGS,
        analytics: { ...DEFAULT_ANALYTICS, areaSize: 12.4, dailyOrders: 120 },
      },
      {
        name: 'West End Hub',
        type: 'premium',
        status: 'active',
        isVisible: true,
        color: '#3B82F6',
        areaSqKm: 8.2,
        city: 'Mumbai',
        cityId: city._id,
        region: 'West',
        polygon: [
          { lat: 19.05, lng: 72.84 },
          { lat: 19.05, lng: 72.85 },
          { lat: 19.04, lng: 72.85 },
          { lat: 19.04, lng: 72.84 },
        ],
        center: { lat: 19.045, lng: 72.845 },
        settings: DEFAULT_SETTINGS,
        analytics: { ...DEFAULT_ANALYTICS, areaSize: 8.2, dailyOrders: 80 },
      },
      {
        name: 'Exclusion Zone A',
        type: 'no-service',
        status: 'active',
        isVisible: true,
        color: '#EF4444',
        areaSqKm: 4.1,
        city: 'Mumbai',
        cityId: city._id,
        region: 'West',
        polygon: [
          { lat: 19.09, lng: 72.86 },
          { lat: 19.09, lng: 72.87 },
          { lat: 19.08, lng: 72.87 },
          { lat: 19.08, lng: 72.86 },
        ],
        center: { lat: 19.085, lng: 72.865 },
        settings: { ...DEFAULT_SETTINGS, deliveryFee: 0, minOrderValue: 0, maxDeliveryRadius: 0 },
        analytics: { ...DEFAULT_ANALYTICS, areaSize: 4.1 },
      },
    ];

    await Zone.deleteMany({});
    await Zone.insertMany(mockZones);

    await Store.deleteMany({
      $or: [
        { 'metadata.geofenceDemo': true },
        { code: { $in: ['GEO-MAIN', 'GEO-WEST', 'GEO-NORTH'] } },
      ],
    });
    await Store.insertMany([
      {
        code: 'GEO-MAIN',
        name: 'Main St. Express',
        type: 'store',
        address: '123 Main St, Downtown',
        x: 42,
        y: 38,
        latitude: 19.071,
        longitude: 72.8827,
        zones: ['Downtown Core'],
        serviceStatus: 'Full',
        metadata: { geofenceDemo: true },
      },
      {
        code: 'GEO-WEST',
        name: 'Westside Market',
        type: 'store',
        address: '456 West Blvd, West End',
        x: 18,
        y: 52,
        latitude: 19.045,
        longitude: 72.845,
        zones: ['West End Hub'],
        serviceStatus: 'Full',
        metadata: { geofenceDemo: true },
      },
      {
        code: 'GEO-NORTH',
        name: 'North Hills Outpost',
        type: 'store',
        address: '789 North Rd, North Hills',
        x: 72,
        y: 22,
        latitude: 19.085,
        longitude: 72.865,
        zones: [],
        serviceStatus: 'Partial',
        metadata: { geofenceDemo: true },
      },
    ]);

    res.status(201).json({ success: true, message: 'Geofence data seeded successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  toggleZoneStatus,
  getHistory,
  getOverlaps,
  getPromoHeatmap,
  getGeofenceStats,
  getStores,
  updateStore,
  seedGeofenceData,
};
