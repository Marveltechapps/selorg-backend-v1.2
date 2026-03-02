const Vehicle = require('../models/Vehicle');
const MaintenanceTask = require('../models/MaintenanceTask');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../core/utils/ErrorResponse');

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
    { new: true, runValidators: true }
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
  const tasks = await MaintenanceTask.find({}).lean().sort({ scheduledDate: 1 });

  res.status(200).json({
    success: true,
    count: tasks.length,
    data: tasks
  });
});

// @desc    Get maintenance task by ID
// @route   GET /api/v1/rider/fleet/maintenance/:id
// @access  Private
const getMaintenanceTaskById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const task = await MaintenanceTask.findOne({ id }).lean();

  if (!task) {
    return next(new ErrorResponse(`Maintenance task not found with id of ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: task
  });
});

// @desc    Create maintenance task
// @route   POST /api/v1/rider/fleet/maintenance
// @access  Private
const createMaintenanceTask = asyncHandler(async (req, res) => {
  const vehicleId = req.body.vehicleId;
  if (!vehicleId) {
    return res.status(400).json({
      success: false,
      message: 'vehicleId is required'
    });
  }
  const vehicle = await Vehicle.findOne({ $or: [{ id: vehicleId }, { vehicleId }] }).lean();
  const vehicleInternalId = vehicle ? (vehicle._id?.toString() || vehicle.id) : vehicleId;

  const payload = {
    id: req.body.id || `MT-${Date.now()}`,
    vehicleId,
    vehicleInternalId,
    type: req.body.type || 'Scheduled Service',
    scheduledDate: req.body.scheduledDate ? new Date(req.body.scheduledDate) : new Date(),
    status: req.body.status || 'upcoming',
    workshopName: req.body.workshopName ?? null,
    notes: req.body.notes ?? null,
    cost: req.body.cost ?? null
  };
  const task = await MaintenanceTask.create(payload);

  res.status(201).json({
    success: true,
    data: task
  });
});

// @desc    Update maintenance task
// @route   PUT /api/v1/rider/fleet/maintenance/:id
// @access  Private
const updateMaintenanceTask = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const task = await MaintenanceTask.findOneAndUpdate(
    { id },
    req.body,
    { new: true, runValidators: true }
  ).lean();

  if (!task) {
    return next(new ErrorResponse(`Maintenance task not found with id of ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: task
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
