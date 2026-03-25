const Store = require('../../merch/models/Store');
const City = require('../../merch/models/City');
const Zone = require('../../merch/models/Zone');
const Staff = require('../../warehouse/models/Staff');
const { asyncHandler } = require('../../core/middleware');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const cacheInvalidation = require('../cacheInvalidation');
const mongoose = require('mongoose');
const DAY_KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STATUS_VALUES = ['active', 'offline', 'inactive', 'maintenance'];
const SERVICE_STATUS_VALUES = ['Full', 'Partial', 'None'];

const toTitleDay = (key = '') => {
  const v = String(key).trim().toLowerCase();
  return v ? `${v[0].toUpperCase()}${v.slice(1)}` : '';
};

function normalizeOperationalHours(hours) {
  if (!hours || typeof hours !== 'object') return undefined;
  const src = hours instanceof Map ? Object.fromEntries(hours) : hours;
  const normalized = {};
  Object.entries(src).forEach(([k, v]) => {
    const day = toTitleDay(k);
    if (!day) return;
    normalized[day] = {
      open: v?.open ?? '09:00',
      close: v?.close ?? '21:00',
      isOpen: typeof v?.isOpen === 'boolean' ? v.isOpen : true,
    };
  });
  return normalized;
}

function validateOperationalHours(hours) {
  if (!hours) return;
  const src = hours instanceof Map ? Object.fromEntries(hours) : hours;
  const keys = Object.keys(src);
  if (keys.length === 0) return;
  const hasAllDays = DAY_KEYS.every((day) => Object.prototype.hasOwnProperty.call(src, day));
  if (!hasAllDays) {
    throw new ErrorResponse('operationalHours must include all 7 days: Monday-Sunday', 400);
  }
  DAY_KEYS.forEach((day) => {
    const slot = src[day];
    if (!slot || typeof slot.open !== 'string' || typeof slot.close !== 'string' || typeof slot.isOpen !== 'boolean') {
      throw new ErrorResponse(`operationalHours.${day} must include open, close and isOpen`, 400);
    }
  });
}

function validateCode(code, fieldName = 'Code') {
  if (!code || !String(code).trim()) {
    throw new ErrorResponse(`${fieldName} is required`, 400);
  }
  const normalized = String(code).trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,20}$/.test(normalized)) {
    throw new ErrorResponse(`${fieldName} must be uppercase alphanumeric with hyphens only (max 20 chars)`, 400);
  }
  return normalized;
}

function validateLocationAndCapacity(body, fallback = {}) {
  const cityId = body.cityId ?? fallback.cityId;
  const zoneId = body.zoneId ?? fallback.zoneId;
  const latitude = body.latitude ?? fallback.latitude;
  const longitude = body.longitude ?? fallback.longitude;
  const maxCapacity = Number(body.maxCapacity ?? fallback.maxCapacity ?? 100);
  const currentLoad = Number(body.currentLoad ?? fallback.currentLoad ?? 0);
  const deliveryRadius = Number(body.deliveryRadius ?? fallback.deliveryRadius ?? 5);
  const status = String(body.status ?? fallback.status ?? 'active');
  const serviceStatus = body.serviceStatus ?? fallback.serviceStatus;
  const email = body.email ?? fallback.email;

  if (!cityId || !mongoose.Types.ObjectId.isValid(cityId)) {
    throw new ErrorResponse('Valid cityId is required', 400);
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ErrorResponse('Latitude is required and must be between -90 and 90', 400);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ErrorResponse('Longitude is required and must be between -180 and 180', 400);
  }
  if (!STATUS_VALUES.includes(status)) {
    throw new ErrorResponse(`status must be one of: ${STATUS_VALUES.join(', ')}`, 400);
  }
  if (serviceStatus && !SERVICE_STATUS_VALUES.includes(serviceStatus)) {
    throw new ErrorResponse(`serviceStatus must be one of: ${SERVICE_STATUS_VALUES.join(', ')}`, 400);
  }
  if (!Number.isFinite(deliveryRadius) || deliveryRadius < 1 || deliveryRadius > 100) {
    throw new ErrorResponse('deliveryRadius must be between 1 and 100', 400);
  }
  if (!Number.isFinite(maxCapacity) || maxCapacity < 0) {
    throw new ErrorResponse('maxCapacity must be a non-negative number', 400);
  }
  if (!Number.isFinite(currentLoad) || currentLoad < 0 || currentLoad > maxCapacity) {
    throw new ErrorResponse('currentLoad must be >= 0 and <= maxCapacity', 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    throw new ErrorResponse('email must be a valid email address', 400);
  }

  return { cityId, zoneId, lat, lng, maxCapacity, currentLoad, deliveryRadius, status };
}

function transformStore(doc) {
  if (!doc) return null;
  const cityName = doc.cityId?.name ?? doc.city ?? (doc.zones && doc.zones[0]) ?? '—';
  const zoneName = doc.zoneId?.name ?? (doc.zones && doc.zones[0]) ?? '—';
  const managerName = doc.managerId?.name ?? doc.manager ?? '';
  const lat = doc.latitude ?? doc.x;
  const lng = doc.longitude ?? doc.y;

  let operationalHours = {};
  if (doc.operationalHours && doc.operationalHours instanceof Map) {
    operationalHours = Object.fromEntries(doc.operationalHours);
  } else if (doc.operationalHours && typeof doc.operationalHours === 'object') {
    operationalHours = doc.operationalHours;
  }

  return {
    id: doc._id?.toString(),
    _id: doc._id,
    code: doc.code ?? `STORE-${doc._id}`,
    name: doc.name,
    type: doc.type ?? 'store',
    address: doc.address,
    city: cityName,
    cityId: doc.cityId?._id ?? doc.cityId,
    zone: zoneName,
    zoneId: doc.zoneId?._id ?? doc.zoneId,
    state: doc.state,
    pincode: doc.pincode,
    latitude: lat,
    longitude: lng,
    phone: doc.phone,
    email: doc.email,
    manager: managerName,
    managerId: doc.managerId?._id ?? doc.managerId,
    status: doc.status ?? (doc.serviceStatus === 'Full' ? 'active' : doc.serviceStatus === 'None' ? 'offline' : 'inactive'),
    deliveryRadius: doc.deliveryRadius ?? 5,
    maxCapacity: doc.maxCapacity ?? 100,
    currentLoad: doc.currentLoad ?? 0,
    operationalHours,
    staffCount: doc.staffCount ?? 0,
    rating: doc.rating ?? 0,
    totalOrders: doc.totalOrders ?? 0,
    revenue: doc.revenue ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const storeWarehouseController = {
  listStores: asyncHandler(async (req, res) => {
    const { search, status, cityId, zoneId, type, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (search && search.trim()) {
      const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { code: { $regex: s, $options: 'i' } },
        { address: { $regex: s, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (cityId && mongoose.Types.ObjectId.isValid(cityId)) filter.cityId = cityId;
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) filter.zoneId = zoneId;
    if (type) filter.type = type;

    const skip = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [stores, total] = await Promise.all([
      Store.find(filter)
        .populate('cityId', 'name code')
        .populate('zoneId', 'name')
        .populate('managerId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Store.countDocuments(filter),
    ]);

    const data = stores.map(transformStore);
    const totalPages = Math.ceil(total / limitNum);
    res.json({
      success: true,
      data,
      pagination: { page: parseInt(page, 10), limit: limitNum, total, totalPages },
    });
  }),

  getStore: asyncHandler(async (req, res) => {
    const store = await Store.findById(req.params.id)
      .populate('cityId', 'name code')
      .populate('zoneId', 'name')
      .populate('managerId', 'name email')
      .lean();
    if (!store) {
      throw new ErrorResponse('Store not found', 404);
    }
    res.json({ success: true, data: transformStore(store) });
  }),

  createStore: asyncHandler(async (req, res) => {
    const body = { ...req.body };
    body.code = validateCode(body.code, 'Store code');
    const validated = validateLocationAndCapacity(body);

    if (body.code) {
      const existing = await Store.findOne({ code: body.code.trim() });
      if (existing) {
        throw new ErrorResponse('Store code already exists', 409);
      }
    }

    const city = await City.findById(validated.cityId).lean();
    if (!city) throw new ErrorResponse('City not found', 400);
    if (validated.zoneId) {
      if (!mongoose.Types.ObjectId.isValid(validated.zoneId)) throw new ErrorResponse('zoneId is invalid', 400);
      const zone = await Zone.findById(validated.zoneId).lean();
      if (!zone) throw new ErrorResponse('Zone not found', 400);
      if (String(zone.cityId) !== String(validated.cityId)) {
        throw new ErrorResponse('zoneId must belong to the selected cityId', 400);
      }
    }

    const normalizedHours = normalizeOperationalHours(body.operationalHours);
    validateOperationalHours(normalizedHours);
    if (normalizedHours) body.operationalHours = new Map(Object.entries(normalizedHours));
    body.latitude = validated.lat;
    body.longitude = validated.lng;
    body.maxCapacity = validated.maxCapacity;
    body.currentLoad = validated.currentLoad;
    body.deliveryRadius = validated.deliveryRadius;
    body.status = validated.status;

    const store = await Store.create(body);
    await cacheInvalidation.invalidateStores().catch(() => {});

    const populated = await Store.findById(store._id)
      .populate('cityId', 'name code')
      .populate('zoneId', 'name')
      .populate('managerId', 'name email')
      .lean();
    res.status(201).json({ success: true, data: transformStore(populated) });
  }),

  updateStore: asyncHandler(async (req, res) => {
    const store = await Store.findById(req.params.id);
    if (!store) {
      throw new ErrorResponse('Store not found', 404);
    }

    const body = { ...req.body };
    const validated = validateLocationAndCapacity(body, store);

    if (body.code && body.code !== store.code) {
      body.code = validateCode(body.code, 'Store code');
      const existing = await Store.findOne({ code: body.code, _id: { $ne: req.params.id } });
      if (existing) {
        throw new ErrorResponse('Store code already exists', 409);
      }
    }

    const city = await City.findById(validated.cityId).lean();
    if (!city) throw new ErrorResponse('City not found', 400);
    const finalZoneId = validated.zoneId ?? store.zoneId;
    if (finalZoneId) {
      if (!mongoose.Types.ObjectId.isValid(finalZoneId)) throw new ErrorResponse('zoneId is invalid', 400);
      const zone = await Zone.findById(finalZoneId).lean();
      if (!zone) throw new ErrorResponse('Zone not found', 400);
      if (String(zone.cityId) !== String(validated.cityId)) {
        throw new ErrorResponse('zoneId must belong to the selected cityId', 400);
      }
    }

    const normalizedHours = normalizeOperationalHours(body.operationalHours);
    validateOperationalHours(normalizedHours);
    if (normalizedHours) body.operationalHours = new Map(Object.entries(normalizedHours));
    body.latitude = validated.lat;
    body.longitude = validated.lng;
    body.maxCapacity = validated.maxCapacity;
    body.currentLoad = validated.currentLoad;
    body.deliveryRadius = validated.deliveryRadius;
    body.status = validated.status;

    const updated = await Store.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
      .populate('cityId', 'name code')
      .populate('zoneId', 'name')
      .populate('managerId', 'name email')
      .lean();

    await cacheInvalidation.invalidateStores().catch(() => {});
    res.json({ success: true, data: transformStore(updated) });
  }),

  deleteStore: asyncHandler(async (req, res) => {
    const store = await Store.findById(req.params.id).populate('zoneId', 'name').lean();
    if (!store) {
      throw new ErrorResponse('Store not found', 404);
    }

    const zoneName = store.zoneId?.name ?? (store.zones && store.zones[0]);
    if (zoneName) {
      try {
        const Order = require('../../warehouse/models/Order');
        const activeCount = await Order.countDocuments({
          zone: zoneName,
          status: { $nin: ['delivered', 'rto', 'returned'] },
        });
        if (activeCount > 0) {
          throw new ErrorResponse(
            'Cannot delete store with active orders. Set status to Offline first.',
            400
          );
        }
      } catch (e) {
        if (e instanceof ErrorResponse) throw e;
      }
    }

    await Store.findByIdAndDelete(req.params.id);
    await cacheInvalidation.invalidateStores().catch(() => {});
    res.json({ success: true, message: 'Store deleted' });
  }),

  // Warehouses (Store with type=warehouse)
  listWarehouses: asyncHandler(async (req, res) => {
    const { search, status, page = 1, limit = 20 } = req.query;
    const filter = { type: 'warehouse' };
    if (status) filter.status = status;
    if (search && search.trim()) {
      const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { code: { $regex: s, $options: 'i' } },
        { address: { $regex: s, $options: 'i' } },
      ];
    }
    const skip = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const [stores, total] = await Promise.all([
      Store.find(filter)
        .populate('cityId', 'name code')
        .populate('zoneId', 'name')
        .populate('managerId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Store.countDocuments(filter),
    ]);
    const data = stores.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      code: s.code ?? `WH-${s._id}`,
      address: s.address,
      city: s.cityId?.name ?? s.city ?? '',
      cityId: s.cityId?._id ?? s.cityId,
      zone: s.zoneId?.name ?? (s.zones && s.zones[0]) ?? '',
      zoneId: s.zoneId?._id ?? s.zoneId,
      storageCapacity: s.maxCapacity ?? 0,
      currentUtilization: s.currentLoad != null ? Math.round((s.currentLoad / (s.maxCapacity || 1)) * 100) : 0,
      manager: s.managerId?.name ?? s.manager ?? '',
      status: s.status ?? 'active',
      createdAt: s.createdAt,
    }));
    const totalPages = Math.ceil(total / limitNum);
    res.json({
      success: true,
      data,
      pagination: { page: parseInt(page, 10), limit: limitNum, total, totalPages },
    });
  }),

  getWarehouse: asyncHandler(async (req, res) => {
    const store = await Store.findOne({ _id: req.params.id, type: 'warehouse' })
      .populate('cityId', 'name code')
      .populate('zoneId', 'name')
      .populate('managerId', 'name email')
      .lean();
    if (!store) throw new ErrorResponse('Warehouse not found', 404);
    res.json({
      success: true,
      data: {
        id: store._id.toString(),
        name: store.name,
        code: store.code ?? `WH-${store._id}`,
        address: store.address,
        city: store.cityId?.name ?? store.city ?? '',
        cityId: store.cityId?._id ?? store.cityId,
        zone: store.zoneId?.name ?? (store.zones && store.zones[0]) ?? '',
        zoneId: store.zoneId?._id ?? store.zoneId,
        storageCapacity: store.maxCapacity ?? 0,
        currentUtilization: store.currentLoad != null ? Math.round((store.currentLoad / (store.maxCapacity || 1)) * 100) : 0,
        manager: store.managerId?.name ?? store.manager ?? '',
        managerId: store.managerId?._id ?? store.managerId,
        status: store.status ?? 'active',
        phone: store.phone,
        email: store.email,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
      },
    });
  }),

  createWarehouse: asyncHandler(async (req, res) => {
    const body = { ...req.body, type: 'warehouse' };
    body.code = validateCode(body.code, 'Warehouse code');
    const validated = validateLocationAndCapacity(body);
    const existing = await Store.findOne({ code: body.code });
    if (existing) throw new ErrorResponse('Warehouse code already exists', 409);
    const city = await City.findById(validated.cityId).lean();
    if (!city) throw new ErrorResponse('City not found', 400);
    if (validated.zoneId) {
      if (!mongoose.Types.ObjectId.isValid(validated.zoneId)) throw new ErrorResponse('zoneId is invalid', 400);
      const zone = await Zone.findById(validated.zoneId).lean();
      if (!zone) throw new ErrorResponse('Zone not found', 400);
      if (String(zone.cityId) !== String(validated.cityId)) {
        throw new ErrorResponse('zoneId must belong to the selected cityId', 400);
      }
    }
    const normalizedHours = normalizeOperationalHours(body.operationalHours);
    validateOperationalHours(normalizedHours);
    if (normalizedHours) body.operationalHours = new Map(Object.entries(normalizedHours));
    body.latitude = validated.lat;
    body.longitude = validated.lng;
    body.maxCapacity = validated.maxCapacity;
    body.currentLoad = validated.currentLoad;
    body.deliveryRadius = validated.deliveryRadius;
    body.status = validated.status;
    const store = await Store.create(body);
    await cacheInvalidation.invalidateStores().catch(() => {});
    const populated = await Store.findById(store._id)
      .populate('cityId', 'name code')
      .populate('zoneId', 'name')
      .populate('managerId', 'name email')
      .lean();
    res.status(201).json({
      success: true,
      data: {
        id: populated._id.toString(),
        name: populated.name,
        code: populated.code,
        address: populated.address,
        city: populated.cityId?.name ?? '',
        cityId: populated.cityId?._id,
        zone: populated.zoneId?.name ?? '',
        zoneId: populated.zoneId?._id,
        storageCapacity: populated.maxCapacity ?? 0,
        currentUtilization: 0,
        manager: populated.managerId?.name ?? '',
        status: populated.status ?? 'active',
        createdAt: populated.createdAt,
      },
    });
  }),

  updateWarehouse: asyncHandler(async (req, res) => {
    const store = await Store.findOne({ _id: req.params.id, type: 'warehouse' });
    if (!store) throw new ErrorResponse('Warehouse not found', 404);
    const body = { ...req.body };
    delete body.type;
    const validated = validateLocationAndCapacity(body, store);
    if (body.code) {
      body.code = validateCode(body.code, 'Warehouse code');
      const existing = await Store.findOne({ code: body.code, _id: { $ne: req.params.id } });
      if (existing) throw new ErrorResponse('Warehouse code already exists', 409);
    }
    const city = await City.findById(validated.cityId).lean();
    if (!city) throw new ErrorResponse('City not found', 400);
    const finalZoneId = validated.zoneId ?? store.zoneId;
    if (finalZoneId) {
      if (!mongoose.Types.ObjectId.isValid(finalZoneId)) throw new ErrorResponse('zoneId is invalid', 400);
      const zone = await Zone.findById(finalZoneId).lean();
      if (!zone) throw new ErrorResponse('Zone not found', 400);
      if (String(zone.cityId) !== String(validated.cityId)) {
        throw new ErrorResponse('zoneId must belong to the selected cityId', 400);
      }
    }
    const normalizedHours = normalizeOperationalHours(body.operationalHours);
    validateOperationalHours(normalizedHours);
    if (normalizedHours) body.operationalHours = new Map(Object.entries(normalizedHours));
    body.latitude = validated.lat;
    body.longitude = validated.lng;
    body.maxCapacity = validated.maxCapacity;
    body.currentLoad = validated.currentLoad;
    body.deliveryRadius = validated.deliveryRadius;
    body.status = validated.status;
    Object.assign(store, body);
    await store.save();
    await cacheInvalidation.invalidateStores().catch(() => {});
    const populated = await Store.findById(store._id)
      .populate('cityId', 'name code')
      .populate('zoneId', 'name')
      .populate('managerId', 'name email')
      .lean();
    res.json({
      success: true,
      data: {
        id: populated._id.toString(),
        name: populated.name,
        code: populated.code,
        address: populated.address,
        city: populated.cityId?.name ?? '',
        cityId: populated.cityId?._id,
        zone: populated.zoneId?.name ?? '',
        zoneId: populated.zoneId?._id,
        storageCapacity: populated.maxCapacity ?? 0,
        currentUtilization: populated.currentLoad != null ? Math.round((populated.currentLoad / (populated.maxCapacity || 1)) * 100) : 0,
        manager: populated.managerId?.name ?? '',
        status: populated.status ?? 'active',
        updatedAt: populated.updatedAt,
      },
    });
  }),

  deleteWarehouse: asyncHandler(async (req, res) => {
    const store = await Store.findOne({ _id: req.params.id, type: 'warehouse' });
    if (!store) throw new ErrorResponse('Warehouse not found', 404);
    store.status = 'inactive';
    await store.save();
    await cacheInvalidation.invalidateStores().catch(() => {});
    res.json({ success: true, message: 'Warehouse deactivated' });
  }),

  // Staff
  listStaff: asyncHandler(async (req, res) => {
    const { storeId, role, status } = req.query;
    const filter = {};
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) filter.storeId = storeId;
    if (role) filter.role = role;
    if (status) filter.status = status;
    const staff = await Staff.find(filter)
      .populate('storeId', 'name code')
      .sort({ name: 1 })
      .lean();
    const data = staff.map((s) => ({
      id: s._id?.toString() ?? s.id,
      name: s.name,
      role: s.role,
      storeId: s.storeId?._id ?? s.storeId,
      storeName: s.storeId?.name ?? s.storeName ?? '',
      zone: s.zone,
      status: s.status,
      currentShift: s.currentShift,
      currentTask: s.currentTask,
      phone: s.phone,
      email: s.email,
      shift: s.shift,
      joinedAt: s.joinedAt,
      performance: s.performance,
      createdAt: s.createdAt,
    }));
    res.json({ success: true, data });
  }),

  getStaff: asyncHandler(async (req, res) => {
    const staff = await Staff.findById(req.params.id).lean();
    if (!staff) {
      throw new ErrorResponse('Staff not found', 404);
    }
    res.json({ success: true, data: staff });
  }),

  createStaff: asyncHandler(async (req, res) => {
    const staff = await Staff.create(req.body);
    await cacheInvalidation.invalidateStaff().catch(() => {});
    res.status(201).json({ success: true, data: staff });
  }),

  updateStaff: asyncHandler(async (req, res) => {
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!staff) {
      throw new ErrorResponse('Staff not found', 404);
    }
    await cacheInvalidation.invalidateStaff().catch(() => {});
    res.json({ success: true, data: staff });
  }),

  deleteStaff: asyncHandler(async (req, res) => {
    const staff = await Staff.findByIdAndDelete(req.params.id);
    if (!staff) {
      throw new ErrorResponse('Staff not found', 404);
    }
    await cacheInvalidation.invalidateStaff().catch(() => {});
    res.json({ success: true, message: 'Staff deleted' });
  }),

  getStorePerformance: asyncHandler(async (req, res) => {
    const stores = await Store.find().lean();
    const performance = stores.map((store) => ({
      storeId: store._id.toString(),
      storeName: store.name,
      ordersToday: 0,
      ordersWeek: 0,
      ordersMonth: 0,
      revenueToday: 0,
      revenueWeek: 0,
      revenueMonth: 0,
      avgRating: 0,
      totalReviews: 0,
      onTimeDelivery: 0,
      capacityUtilization: 0,
    }));
    res.json({ success: true, data: performance });
  }),

  getStoreStats: asyncHandler(async (req, res) => {
    const stores = await Store.find().lean();
    const staff = await Staff.find().lean();
    const activeStatus = ['active'];
    const activeCount = stores.filter((s) => activeStatus.includes(s.status) || s.serviceStatus === 'Full').length;
    const warehouseCount = stores.filter((s) => s.type === 'warehouse').length;
    const avgRating = stores.length && stores.some((s) => s.rating != null)
      ? stores.reduce((a, s) => a + (Number(s.rating) || 0), 0) / stores.filter((s) => s.rating != null).length
      : 0;

    res.json({
      success: true,
      data: {
        totalStores: stores.length,
        activeStores: activeCount,
        darkStores: stores.filter((s) => s.type === 'dark_store').length,
        totalWarehouses: warehouseCount,
        totalStaff: staff.length,
        avgRating: Math.round(avgRating * 10) / 10,
        totalRevenue: stores.reduce((a, s) => a + (Number(s.revenue) || 0), 0),
        avgCapacityUtilization: 0,
      },
    });
  }),
};

module.exports = storeWarehouseController;
