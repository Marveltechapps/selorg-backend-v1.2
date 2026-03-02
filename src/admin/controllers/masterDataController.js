const City = require('../../merch/models/City');
const Zone = require('../../merch/models/Zone');
const VehicleType = require('../../merch/models/VehicleType');
const SkuUnit = require('../../merch/models/SkuUnit');
const Store = require('../../merch/models/Store');
const AdminUser = require('../models/User');
const { asyncHandler } = require('../../core/middleware');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const mongoose = require('mongoose');

// --- Cities ---
const listCities = asyncHandler(async (req, res) => {
  const { isActive, search, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }
  if (search && search.trim()) {
    const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { code: { $regex: s, $options: 'i' } },
    ];
  }
  const skip = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const [cities, total] = await Promise.all([
    City.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
    City.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limitNum);
  res.json({
    success: true,
    data: cities.map((c) => ({
      id: c._id.toString(),
      _id: c._id,
      code: c.code,
      name: c.name,
      state: c.state,
      country: c.country,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    pagination: { page: parseInt(page, 10), limit: limitNum, total, totalPages },
  });
});

const getCity = asyncHandler(async (req, res) => {
  const city = await City.findById(req.params.id).lean();
  if (!city) throw new ErrorResponse('City not found', 404);
  res.json({
    success: true,
    data: {
      id: city._id.toString(),
      ...city,
    },
  });
});

const createCity = asyncHandler(async (req, res) => {
  const { code, name, state, country } = req.body;
  if (!code || !String(code).trim()) throw new ErrorResponse('City code is required', 400);
  if (!name || !String(name).trim()) throw new ErrorResponse('City name is required', 400);
  const codeTrim = String(code).trim();
  const existing = await City.findOne({ code: codeTrim });
  if (existing) throw new ErrorResponse('City code already exists', 409);
  const city = await City.create({
    code: codeTrim,
    name: String(name).trim(),
    state: state ? String(state).trim() : undefined,
    country: country ? String(country).trim() : 'India',
  });
  res.status(201).json({ success: true, data: { id: city._id.toString(), ...city.toObject() } });
});

const updateCity = asyncHandler(async (req, res) => {
  const city = await City.findById(req.params.id);
  if (!city) throw new ErrorResponse('City not found', 404);
  const { code, name, state, country, isActive } = req.body;
  if (code !== undefined) {
    const codeTrim = String(code).trim();
    if (!codeTrim) throw new ErrorResponse('City code cannot be empty', 400);
    const existing = await City.findOne({ code: codeTrim, _id: { $ne: req.params.id } });
    if (existing) throw new ErrorResponse('City code already exists', 409);
    city.code = codeTrim;
  }
  if (name !== undefined) city.name = String(name).trim();
  if (state !== undefined) city.state = state ? String(state).trim() : undefined;
  if (country !== undefined) city.country = country ? String(country).trim() : city.country;
  if (isActive !== undefined) city.isActive = isActive === true || isActive === 'true';
  await city.save();
  res.json({ success: true, data: { id: city._id.toString(), ...city.toObject() } });
});

const deleteCity = asyncHandler(async (req, res) => {
  const city = await City.findById(req.params.id);
  if (!city) throw new ErrorResponse('City not found', 404);
  const storeCount = await Store.countDocuments({ cityId: city._id });
  if (storeCount > 0) {
    throw new ErrorResponse(
      `Cannot delete city: ${storeCount} store(s) reference it. Remove or reassign stores first.`,
      400
    );
  }
  city.isActive = false;
  await city.save();
  res.json({ success: true, message: 'City deactivated' });
});

// --- Zones ---
const listZones = asyncHandler(async (req, res) => {
  const { cityId, status, search, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (cityId && mongoose.Types.ObjectId.isValid(cityId)) filter.cityId = cityId;
  if (status) filter.status = status;
  if (search && search.trim()) {
    const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { code: { $regex: s, $options: 'i' } },
    ];
  }
  const skip = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const [zones, total] = await Promise.all([
    Zone.find(filter).populate('cityId', 'name code').sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
    Zone.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limitNum);
  res.json({
    success: true,
    data: zones.map((z) => ({
      id: z._id.toString(),
      _id: z._id,
      name: z.name,
      code: z.code,
      cityId: z.cityId?._id ?? z.cityId,
      cityName: z.cityId?.name,
      type: z.type,
      status: z.status,
      color: z.color,
      areaSqKm: z.areaSqKm,
      defaultCapacity: z.defaultCapacity,
      createdAt: z.createdAt,
      updatedAt: z.updatedAt,
    })),
    pagination: { page: parseInt(page, 10), limit: limitNum, total, totalPages },
  });
});

const getZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findById(req.params.id).populate('cityId', 'name code').lean();
  if (!zone) throw new ErrorResponse('Zone not found', 404);
  res.json({
    success: true,
    data: {
      id: zone._id.toString(),
      ...zone,
      cityName: zone.cityId?.name,
    },
  });
});

const createZone = asyncHandler(async (req, res) => {
  const { name, code, cityId, type, status, color, areaSqKm, defaultCapacity } = req.body;
  if (!name || !String(name).trim()) throw new ErrorResponse('Zone name is required', 400);
  if (!cityId || !mongoose.Types.ObjectId.isValid(cityId)) throw new ErrorResponse('Valid cityId is required', 400);
  const city = await City.findById(cityId);
  if (!city) throw new ErrorResponse('City not found', 400);
  const zone = await Zone.create({
    name: String(name).trim(),
    code: code ? String(code).trim() : undefined,
    cityId,
    type: type || 'Serviceable',
    status: status || 'Active',
    color: color || '#3b82f6',
    areaSqKm: areaSqKm != null ? Number(areaSqKm) : 0,
    defaultCapacity: defaultCapacity != null ? Number(defaultCapacity) : undefined,
  });
  const populated = await Zone.findById(zone._id).populate('cityId', 'name code').lean();
  res.status(201).json({ success: true, data: { id: populated._id.toString(), ...populated, cityName: populated.cityId?.name } });
});

const updateZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!zone) throw new ErrorResponse('Zone not found', 404);
  const { name, code, cityId, type, status, color, areaSqKm, defaultCapacity } = req.body;
  if (name !== undefined) zone.name = String(name).trim();
  if (code !== undefined) zone.code = code ? String(code).trim() : undefined;
  if (cityId && mongoose.Types.ObjectId.isValid(cityId)) {
    const city = await City.findById(cityId);
    if (!city) throw new ErrorResponse('City not found', 400);
    zone.cityId = cityId;
  }
  if (type !== undefined) zone.type = type;
  if (status !== undefined) zone.status = status;
  if (color !== undefined) zone.color = color;
  if (areaSqKm !== undefined) zone.areaSqKm = Number(areaSqKm);
  if (defaultCapacity !== undefined) zone.defaultCapacity = defaultCapacity != null ? Number(defaultCapacity) : undefined;
  await zone.save();
  const populated = await Zone.findById(zone._id).populate('cityId', 'name code').lean();
  res.json({ success: true, data: { id: populated._id.toString(), ...populated, cityName: populated.cityId?.name } });
});

const deleteZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!zone) throw new ErrorResponse('Zone not found', 404);
  const storeCount = await Store.countDocuments({ zoneId: zone._id });
  if (storeCount > 0) {
    throw new ErrorResponse(
      `Cannot delete zone: ${storeCount} store(s) reference it. Remove or reassign stores first.`,
      400
    );
  }
  await Zone.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Zone deleted' });
});

// --- Managers (for dropdowns) ---
const listManagers = asyncHandler(async (req, res) => {
  const users = await AdminUser.find({ status: 'active' })
    .select('name email')
    .sort({ name: 1 })
    .lean();
  const data = users.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
  }));
  res.json({ success: true, data });
});

// --- Vehicle Types ---
const listVehicleTypes = asyncHandler(async (req, res) => {
  const { isActive } = req.query;
  const filter = {};
  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }
  const items = await VehicleType.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  res.json({
    success: true,
    data: items.map((v) => ({ id: v._id.toString(), ...v })),
  });
});

const getVehicleType = asyncHandler(async (req, res) => {
  const item = await VehicleType.findById(req.params.id).lean();
  if (!item) throw new ErrorResponse('Vehicle type not found', 404);
  res.json({ success: true, data: { id: item._id.toString(), ...item } });
});

const createVehicleType = asyncHandler(async (req, res) => {
  const { code, name, description, isActive, sortOrder } = req.body;
  if (!code || !String(code).trim()) throw new ErrorResponse('Code is required', 400);
  if (!name || !String(name).trim()) throw new ErrorResponse('Name is required', 400);
  const codeTrim = String(code).trim();
  const existing = await VehicleType.findOne({ code: codeTrim });
  if (existing) throw new ErrorResponse('Vehicle type code already exists', 409);
  const item = await VehicleType.create({
    code: codeTrim,
    name: String(name).trim(),
    description: description ? String(description).trim() : undefined,
    isActive: isActive !== false,
    sortOrder: sortOrder != null ? Number(sortOrder) : 0,
  });
  res.status(201).json({ success: true, data: { id: item._id.toString(), ...item.toObject() } });
});

const updateVehicleType = asyncHandler(async (req, res) => {
  const item = await VehicleType.findById(req.params.id);
  if (!item) throw new ErrorResponse('Vehicle type not found', 404);
  const { code, name, description, isActive, sortOrder } = req.body;
  if (code !== undefined) {
    const codeTrim = String(code).trim();
    if (!codeTrim) throw new ErrorResponse('Code cannot be empty', 400);
    const existing = await VehicleType.findOne({ code: codeTrim, _id: { $ne: req.params.id } });
    if (existing) throw new ErrorResponse('Vehicle type code already exists', 409);
    item.code = codeTrim;
  }
  if (name !== undefined) item.name = String(name).trim();
  if (description !== undefined) item.description = description ? String(description).trim() : undefined;
  if (isActive !== undefined) item.isActive = isActive === true || isActive === 'true';
  if (sortOrder !== undefined) item.sortOrder = Number(sortOrder);
  await item.save();
  res.json({ success: true, data: { id: item._id.toString(), ...item.toObject() } });
});

const deleteVehicleType = asyncHandler(async (req, res) => {
  const item = await VehicleType.findById(req.params.id);
  if (!item) throw new ErrorResponse('Vehicle type not found', 404);
  item.isActive = false;
  await item.save();
  res.json({ success: true, message: 'Vehicle type deactivated' });
});

// --- SKU Units ---
const listSkuUnits = asyncHandler(async (req, res) => {
  const { isActive } = req.query;
  const filter = {};
  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }
  const items = await SkuUnit.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  res.json({
    success: true,
    data: items.map((s) => ({ id: s._id.toString(), ...s })),
  });
});

const getSkuUnit = asyncHandler(async (req, res) => {
  const item = await SkuUnit.findById(req.params.id).lean();
  if (!item) throw new ErrorResponse('SKU unit not found', 404);
  res.json({ success: true, data: { id: item._id.toString(), ...item } });
});

const createSkuUnit = asyncHandler(async (req, res) => {
  const { code, name, baseUnit, conversionFactor, isActive, sortOrder } = req.body;
  if (!code || !String(code).trim()) throw new ErrorResponse('Code is required', 400);
  if (!name || !String(name).trim()) throw new ErrorResponse('Name is required', 400);
  const codeTrim = String(code).trim();
  const existing = await SkuUnit.findOne({ code: codeTrim });
  if (existing) throw new ErrorResponse('SKU unit code already exists', 409);
  const item = await SkuUnit.create({
    code: codeTrim,
    name: String(name).trim(),
    baseUnit: baseUnit ? String(baseUnit).trim() : undefined,
    conversionFactor: conversionFactor != null ? Number(conversionFactor) : undefined,
    isActive: isActive !== false,
    sortOrder: sortOrder != null ? Number(sortOrder) : 0,
  });
  res.status(201).json({ success: true, data: { id: item._id.toString(), ...item.toObject() } });
});

const updateSkuUnit = asyncHandler(async (req, res) => {
  const item = await SkuUnit.findById(req.params.id);
  if (!item) throw new ErrorResponse('SKU unit not found', 404);
  const { code, name, baseUnit, conversionFactor, isActive, sortOrder } = req.body;
  if (code !== undefined) {
    const codeTrim = String(code).trim();
    if (!codeTrim) throw new ErrorResponse('Code cannot be empty', 400);
    const existing = await SkuUnit.findOne({ code: codeTrim, _id: { $ne: req.params.id } });
    if (existing) throw new ErrorResponse('SKU unit code already exists', 409);
    item.code = codeTrim;
  }
  if (name !== undefined) item.name = String(name).trim();
  if (baseUnit !== undefined) item.baseUnit = baseUnit ? String(baseUnit).trim() : undefined;
  if (conversionFactor !== undefined) item.conversionFactor = conversionFactor != null ? Number(conversionFactor) : undefined;
  if (isActive !== undefined) item.isActive = isActive === true || isActive === 'true';
  if (sortOrder !== undefined) item.sortOrder = Number(sortOrder);
  await item.save();
  res.json({ success: true, data: { id: item._id.toString(), ...item.toObject() } });
});

const deleteSkuUnit = asyncHandler(async (req, res) => {
  const item = await SkuUnit.findById(req.params.id);
  if (!item) throw new ErrorResponse('SKU unit not found', 404);
  item.isActive = false;
  await item.save();
  res.json({ success: true, message: 'SKU unit deactivated' });
});

const masterDataController = {
  listCities,
  getCity,
  createCity,
  updateCity,
  deleteCity,
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone,
  listManagers,
  listVehicleTypes,
  getVehicleType,
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
  listSkuUnits,
  getSkuUnit,
  createSkuUnit,
  updateSkuUnit,
  deleteSkuUnit,
};

module.exports = masterDataController;
