const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const MaintenanceTask = require('../models/MaintenanceTask');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../core/utils/ErrorResponse');

const MAINTENANCE_UPDATE_FIELDS = ['scheduledDate', 'status', 'workshopName', 'notes', 'cost', 'type'];

function maintenanceTaskLookup(id) {
  if (!id) return null;
  const clauses = [{ id: String(id) }];
  if (mongoose.Types.ObjectId.isValid(id)) {
    clauses.push({ _id: new mongoose.Types.ObjectId(id) });
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function pickMaintenanceUpdates(body) {
  const updates = {};
  MAINTENANCE_UPDATE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) updates[field] = body[field];
  });
  return updates;
}

function toIsoDateString(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'object' && value.$date) {
    const d = new Date(value.$date);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildVehicleLookupMap(vehicles) {
  const map = new Map();
  vehicles.forEach((v) => {
    if (v.id) map.set(v.id, v);
    if (v.vehicleId) map.set(v.vehicleId, v);
  });
  return map;
}

function serializeMaintenanceTask(task, vehicleByAnyId = new Map()) {
  const vehicle =
    vehicleByAnyId.get(task.vehicleId) ||
    vehicleByAnyId.get(task.vehicleInternalId);
  const displayVehicleId =
    vehicle?.vehicleId || task.vehicleId || task.vehicleInternalId || null;

  let scheduledDate = toIsoDateString(task.scheduledDate);
  if (!scheduledDate && task.createdAt) {
    scheduledDate = toIsoDateString(task.createdAt);
  }

  return {
    id: task.id || (task._id ? String(task._id) : null),
    vehicleId: displayVehicleId,
    vehicleInternalId: task.vehicleInternalId || vehicle?.id || null,
    vehicleType: vehicle?.type || null,
    type: task.type,
    scheduledDate,
    status: task.status,
    workshopName: task.workshopName ?? null,
    notes: task.notes ?? null,
    cost: task.cost ?? null,
  };
}

async function loadVehiclesForTasks(tasks) {
  const lookupKeys = new Set();
  tasks.forEach((t) => {
    if (t.vehicleId) lookupKeys.add(t.vehicleId);
    if (t.vehicleInternalId) lookupKeys.add(t.vehicleInternalId);
  });
  const keys = [...lookupKeys];
  if (!keys.length) return new Map();
  const vehicles = await Vehicle.find({
    $or: [{ id: { $in: keys } }, { vehicleId: { $in: keys } }],
  })
    .select('id vehicleId type')
    .lean();
  return buildVehicleLookupMap(vehicles);
}

// @desc    Get fleet summary
// @route   GET /api/v1/rider/fleet/summary
// @access  Private
const getFleetSummary = asyncHandler(async (req, res) => {
  const totalFleet = await Vehicle.countDocuments();
  const inMaintenance = await Vehicle.countDocuments({ status: 'maintenance' });
  const evCount = await Vehicle.countDocuments({ fuelType: 'EV' });
  const evUsagePercent = totalFleet > 0 ? Math.round((evCount / totalFleet) * 100) : 0;
  
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const scheduledServicesNextWeek = await MaintenanceTask.countDocuments({
    scheduledDate: { $gte: new Date(), $lte: nextWeek },
    status: { $ne: 'completed' }
  });

  res.status(200).json({
    success: true,
    data: {
      totalFleet,
      inMaintenance,
      evUsagePercent,
      scheduledServicesNextWeek
    }
  });
});

// @desc    List vehicles
// @route   GET /api/v1/rider/fleet/vehicles
// @access  Private
const listVehicles = asyncHandler(async (req, res) => {
  const { status, type, fuelType } = req.query;
  const query = {};
  
  if (status && status !== 'all') {
    query.status = status;
  }
  if (type && type !== 'all') {
    query.type = type;
  }
  if (fuelType && fuelType !== 'all') {
    query.fuelType = fuelType;
  }

  const vehicles = await Vehicle.find(query).lean().sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: vehicles.length,
    data: vehicles
  });
});

// @desc    Get vehicle by ID
// @route   GET /api/v1/rider/fleet/vehicles/:id
// @access  Private
const getVehicleById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const vehicle = await Vehicle.findOne({ id }).lean();

  if (!vehicle) {
    return next(new ErrorResponse(`Vehicle not found with id of ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: vehicle
  });
});

// @desc    Create vehicle
// @route   POST /api/v1/rider/fleet/vehicles
// @access  Private
const createVehicle = asyncHandler(async (req, res) => {
  const now = new Date();
  const nextYear = new Date(now);
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextService = new Date(now);
  nextService.setMonth(nextService.getMonth() + 6);

  const payload = {
    id: req.body.id || `VH-${Date.now()}`,
    vehicleId: req.body.vehicleId || `VH-${Date.now()}`,
    type: req.body.type || 'Electric Scooter',
    fuelType: req.body.fuelType || 'EV',
    status: req.body.status || 'active',
    conditionScore: req.body.conditionScore ?? 100,
    assignedRiderId: req.body.assignedRiderId ?? null,
    assignedRiderName: req.body.assignedRiderName ?? null,
    documents: req.body.documents ?? {
      rcValidTill: nextYear,
      insuranceValidTill: nextYear,
      pucValidTill: null
    },
    nextServiceDueDate: req.body.nextServiceDueDate ? new Date(req.body.nextServiceDueDate) : nextService,
    notes: req.body.notes ?? null
  };
  const vehicle = await Vehicle.create(payload);

  res.status(201).json({
    success: true,
    data: vehicle
  });
});

// @desc    Update vehicle
// @route   PUT /api/v1/rider/fleet/vehicles/:id
// @access  Private
const updateVehicle = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const vehicle = await Vehicle.findOneAndUpdate(
    { id },
    req.body,
    { new: true, runValidators: true, validateModifiedOnly: true }
  ).lean();

  if (!vehicle) {
    return next(new ErrorResponse(`Vehicle not found with id of ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: vehicle
  });
});

// @desc    List maintenance tasks
// @route   GET /api/v1/rider/fleet/maintenance
// @access  Private
const listMaintenanceTasks = asyncHandler(async (req, res) => {
  let tasks = await MaintenanceTask.find({}).lean().sort({ scheduledDate: 1 });

  const repairs = [];
  for (const task of tasks) {
    if (!toIsoDateString(task.scheduledDate) && task.createdAt) {
      repairs.push({
        updateOne: {
          filter: { id: task.id },
          update: { $set: { scheduledDate: new Date(task.createdAt) } },
        },
      });
      task.scheduledDate = task.createdAt;
    }
  }
  if (repairs.length) {
    await MaintenanceTask.bulkWrite(repairs);
  }

  const vehicleByAnyId = await loadVehiclesForTasks(tasks);
  const enriched = tasks.map((task) => serializeMaintenanceTask(task, vehicleByAnyId));

  res.status(200).json({
    success: true,
    count: enriched.length,
    data: enriched,
  });
});

// @desc    Get maintenance task by ID
// @route   GET /api/v1/rider/fleet/maintenance/:id
// @access  Private
const getMaintenanceTaskById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const lookup = maintenanceTaskLookup(id);
  const task = lookup ? await MaintenanceTask.findOne(lookup).lean() : null;

  if (!task) {
    return next(new ErrorResponse(`Maintenance task not found with id of ${id}`, 404));
  }

  const vehicleByAnyId = await loadVehiclesForTasks([task]);

  res.status(200).json({
    success: true,
    data: serializeMaintenanceTask(task, vehicleByAnyId),
  });
});

// @desc    Create maintenance task
// @route   POST /api/v1/rider/fleet/maintenance
// @access  Private
const MAINTENANCE_TYPES = ['Scheduled Service', 'Breakdown', 'Inspection'];

const createMaintenanceTask = asyncHandler(async (req, res, next) => {
  const vehicleIdInput = req.body.vehicleId;
  if (!vehicleIdInput || typeof vehicleIdInput !== 'string' || !vehicleIdInput.trim()) {
    return next(new ErrorResponse('vehicleId is required', 400));
  }

  const type = req.body.type || 'Scheduled Service';
  if (!MAINTENANCE_TYPES.includes(type)) {
    return next(new ErrorResponse(
      `Invalid maintenance type. Must be one of: ${MAINTENANCE_TYPES.join(', ')}`,
      400
    ));
  }

  if (!req.body.scheduledDate) {
    return next(new ErrorResponse('scheduledDate is required', 400));
  }
  const scheduledDate = new Date(req.body.scheduledDate);
  if (Number.isNaN(scheduledDate.getTime())) {
    return next(new ErrorResponse('Invalid scheduledDate. Expected a valid ISO date.', 400));
  }

  const vehicle = await Vehicle.findOne({
    $or: [{ id: vehicleIdInput.trim() }, { vehicleId: vehicleIdInput.trim() }],
  }).lean();

  const displayVehicleId = vehicle?.vehicleId || vehicleIdInput.trim();
  const vehicleInternalId =
    vehicle?.id ||
    req.body.vehicleInternalId ||
    vehicleIdInput.trim();

  const payload = {
    id: req.body.id || `MT-${Date.now()}`,
    vehicleId: displayVehicleId,
    vehicleInternalId: String(vehicleInternalId),
    type,
    scheduledDate,
    status: req.body.status || 'upcoming',
    workshopName: req.body.workshopName ?? null,
    notes: req.body.notes ?? null,
    cost: req.body.cost ?? null,
  };
  const task = await MaintenanceTask.create(payload);
  const taskLean = task.toObject ? task.toObject() : task;
  const vehicleByAnyId = await loadVehiclesForTasks([taskLean]);

  res.status(201).json({
    success: true,
    data: serializeMaintenanceTask(taskLean, vehicleByAnyId),
  });
});

// @desc    Update maintenance task
// @route   PUT /api/v1/rider/fleet/maintenance/:id
// @access  Private
const updateMaintenanceTask = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const lookup = maintenanceTaskLookup(id);
  if (!lookup) {
    return next(new ErrorResponse('Maintenance task id is required', 400));
  }

  const updates = pickMaintenanceUpdates(req.body);
  if (Object.keys(updates).length === 0) {
    return next(new ErrorResponse('No valid fields to update', 400));
  }

  if (updates.scheduledDate !== undefined) {
    const iso = toIsoDateString(updates.scheduledDate);
    if (!iso) {
      return next(new ErrorResponse('Invalid scheduledDate. Expected a valid ISO date.', 400));
    }
    updates.scheduledDate = new Date(iso);
  }

  if (updates.type && !MAINTENANCE_TYPES.includes(updates.type)) {
    return next(new ErrorResponse(
      `Invalid maintenance type. Must be one of: ${MAINTENANCE_TYPES.join(', ')}`,
      400
    ));
  }

  const task = await MaintenanceTask.findOneAndUpdate(
    lookup,
    updates,
    { new: true, runValidators: true }
  ).lean();

  if (!task) {
    return next(new ErrorResponse(`Maintenance task not found with id of ${id}`, 404));
  }

  const vehicleByAnyId = await loadVehiclesForTasks([task]);

  res.status(200).json({
    success: true,
    data: serializeMaintenanceTask(task, vehicleByAnyId),
  });
});

module.exports = {
  getFleetSummary,
  listVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  listMaintenanceTasks,
  getMaintenanceTaskById,
  createMaintenanceTask,
  updateMaintenanceTask
};
