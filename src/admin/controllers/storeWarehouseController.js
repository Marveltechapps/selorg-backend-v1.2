const Store = require('../../merch/models/Store');
const City = require('../../merch/models/City');
const Zone = require('../../merch/models/Zone');
const Staff = require('../../warehouse/models/Staff');
const { asyncHandler } = require('../../core/middleware');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const cacheInvalidation = require('../cacheInvalidation');
const mongoose = require('mongoose');

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
    if (!body.code || !String(body.code).trim()) {
      throw new ErrorResponse('Store code is required', 400);
    }
    body.code = String(body.code).trim();

    if (body.type === 'dark_store') {
      const lat = parseFloat(body.latitude);
      const lng = parseFloat(body.longitude);
      if (isNaN(lat) || isNaN(lng)) {
        throw new ErrorResponse('Latitude and Longitude are required for darkstores', 400);
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ErrorResponse('Invalid coordinates', 400);
      }
    }

    if (body.code) {
      const existing = await Store.findOne({ code: body.code.trim() });
      if (existing) {
        throw new ErrorResponse('Store code already exists', 409);
      }
    }

    if (body.cityId && mongoose.Types.ObjectId.isValid(body.cityId)) {
      const city = await City.findById(body.cityId);
      if (!city) throw new ErrorResponse('City not found', 400);
    }
    if (body.zoneId && mongoose.Types.ObjectId.isValid(body.zoneId)) {
      const zone = await Zone.findById(body.zoneId);
      if (!zone) throw new ErrorResponse('Zone not found', 400);
    }

    if (body.operationalHours && typeof body.operationalHours === 'object' && !(body.operationalHours instanceof Map)) {
      body.operationalHours = new Map(Object.entries(body.operationalHours));
    }

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

    const effectiveType = body.type || store.type;
    if (effectiveType === 'dark_store') {
      const lat = parseFloat(body.latitude ?? store.latitude);
      const lng = parseFloat(body.longitude ?? store.longitude);
      if (isNaN(lat) || isNaN(lng)) {
        throw new ErrorResponse('Latitude and Longitude are required for darkstores', 400);
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ErrorResponse('Invalid coordinates', 400);
      }
    }

    if (body.code && body.code !== store.code) {
      const existing = await Store.findOne({ code: body.code.trim(), _id: { $ne: req.params.id } });
      if (existing) {
        throw new ErrorResponse('Store code already exists', 409);
      }
    }

    if (body.cityId && mongoose.Types.ObjectId.isValid(body.cityId)) {
      const city = await City.findById(body.cityId);
      if (!city) throw new ErrorResponse('City not found', 400);
    }
    if (body.zoneId && mongoose.Types.ObjectId.isValid(body.zoneId)) {
      const zone = await Zone.findById(body.zoneId);
      if (!zone) throw new ErrorResponse('Zone not found', 400);
    }

    if (body.operationalHours && typeof body.operationalHours === 'object' && !(body.operationalHours instanceof Map)) {
      body.operationalHours = new Map(Object.entries(body.operationalHours));
    }

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
    const { search, status, page = 1, limit = 50 } = req.query;
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
    if (!body.code || !String(body.code).trim()) {
      throw new ErrorResponse('Warehouse code is required', 400);
    }
    body.code = String(body.code).trim();
    const existing = await Store.findOne({ code: body.code });
    if (existing) throw new ErrorResponse('Warehouse code already exists', 409);
    if (body.cityId && mongoose.Types.ObjectId.isValid(body.cityId)) {
      const city = await City.findById(body.cityId);
      if (!city) throw new ErrorResponse('City not found', 400);
    }
    if (body.zoneId && mongoose.Types.ObjectId.isValid(body.zoneId)) {
      const zone = await Zone.findById(body.zoneId);
      if (!zone) throw new ErrorResponse('Zone not found', 400);
    }
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
    if (body.code) {
      const existing = await Store.findOne({ code: body.code.trim(), _id: { $ne: req.params.id } });
      if (existing) throw new ErrorResponse('Warehouse code already exists', 409);
    }
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
    await Store.findByIdAndDelete(req.params.id);
    await cacheInvalidation.invalidateStores().catch(() => {});
    res.json({ success: true, message: 'Warehouse deleted' });
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
