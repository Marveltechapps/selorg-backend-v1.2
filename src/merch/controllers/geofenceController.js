const Zone = require('../models/Zone');
const ZoneAudit = require('../models/ZoneAudit');
const Store = require('../models/Store');
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
  return { ...zone, ...updates };
}

// @desc    Get all zones (Admin Geofence format)
// @route   GET /api/v1/merch/geofence/zones
const getZones = async (req, res, next) => {
  try {
    const zones = await Zone.find().sort({ createdAt: -1 }).populate('cityId', 'name').lean();
    const data = zones.map((z) => zoneToGeofenceZone(z));
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
    res.status(200).json({ success: true, data: zoneToGeofenceZone(zone) });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new zone
// @route   POST /api/v1/merch/geofence/zones
const createZone = async (req, res, next) => {
  try {
    const body = buildZoneFromBody(req.body, null);
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
    const body = buildZoneFromBody(req.body, zone);
    const previousStatus = zone.status;
    Object.assign(zone, body);
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

// @desc    Get overlap warnings (placeholder - returns empty; can implement geo overlap logic later)
// @route   GET /api/v1/merch/geofence/overlaps
const getOverlaps = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: [] });
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
    const doc = await Zone.findById(zone._id).populate('cityId', 'name').lean();
    res.status(200).json({ success: true, data: zoneToGeofenceZone(doc) });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all stores
// @route   GET /api/v1/merch/geofence/stores
const getStores = async (req, res, next) => {
  try {
    const stores = await Store.find();
    res.status(200).json({ success: true, count: stores.length, data: stores });
  } catch (err) {
    next(err);
  }
};

// @desc    Seed Geofence Data
// @route   POST /api/v1/merch/geofence/seed
const seedGeofenceData = async (req, res, next) => {
  try {
    const mockZones = [
      {
        name: 'Downtown Core',
        type: 'standard',
        status: 'active',
        isVisible: true,
        color: '#10B981',
        areaSqKm: 12.4,
        city: 'Mumbai',
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

    await Store.deleteMany({});
    await Store.insertMany([
      { name: 'Main St. Express', address: '123 Main St, Downtown', x: 42, y: 38, zones: ['Downtown Core'], serviceStatus: 'Full' },
      { name: 'Westside Market', address: '456 West Blvd, West End', x: 18, y: 52, zones: ['West End Hub'], serviceStatus: 'Full' },
      { name: 'North Hills Outpost', address: '789 North Rd, North Hills', x: 72, y: 22, zones: [], serviceStatus: 'Partial' },
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
  getStores,
  seedGeofenceData,
};
