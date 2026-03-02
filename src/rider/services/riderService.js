const Rider = require('../models/Rider');
const Order = require('../../warehouse/models/Order');
const RiderHR = require('../models/RiderHR');
const Training = require('../models/Training');
const Compliance = require('../models/Compliance');
const Contract = require('../models/Contract');
const Staff = require('../../warehouse/models/Staff');
const { calculateDistance } = require('../../utils/distanceCalculator');
const appConfig = require('../../config/app');

const listRiders = async (filters = {}, pagination = {}) => {
  const {
    status,
    zone,
    search,
    page = 1,
    limit = 50,
  } = { ...filters, ...pagination };

  const query = {};

  // Status filter
  if (status) {
    query.status = status;
  }

  // Zone filter
  if (zone) {
    query.zone = { $regex: zone, $options: 'i' };
  }

  // Search filter
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { id: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const total = await Rider.countDocuments(query);
  const riders = await Rider.find(query)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    riders,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
  };
};

const getRiderById = async (riderId) => {
  const rider = await Rider.findOne({ id: riderId }).lean();
  
  if (!rider) {
    // In development mode, return mock rider data for testing
    if (appConfig.nodeEnv === 'development') {
      return {
        id: riderId,
        name: 'Test Rider',
        avatarInitials: 'TR',
        status: 'online',
        currentOrderId: null,
        location: {
          lat: 40.7128,
          lng: -74.0060
        },
        capacity: {
          currentLoad: 0,
          maxLoad: 5
        },
        avgEtaMins: 18,
        rating: 4.7,
        zone: 'Zone A',
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    const error = new Error('Rider not found');
    error.statusCode = 404;
    throw error;
  }

  return rider;
};

const updateRider = async (riderId, updateData) => {
  let rider = await Rider.findOne({ id: riderId });
  
  if (!rider) {
    // In development mode, create a mock rider for testing
    if (appConfig.nodeEnv === 'development') {
      const mockRider = {
        id: riderId,
        name: updateData.name || 'Test Rider',
        avatarInitials: 'TR',
        status: updateData.status || 'online',
        currentOrderId: null,
        location: {
          lat: 40.7128,
          lng: -74.0060
        },
        capacity: {
          currentLoad: 0,
          maxLoad: 5
        },
        avgEtaMins: 18,
        rating: 4.7,
        zone: updateData.zone || 'Zone A'
      };
      
      // Apply updates to mock rider
      if (updateData.name !== undefined) mockRider.name = updateData.name;
      if (updateData.status !== undefined) mockRider.status = updateData.status;
      if (updateData.zone !== undefined) mockRider.zone = updateData.zone;
      
      return mockRider;
    }
    
    const error = new Error('Rider not found');
    error.statusCode = 404;
    throw error;
  }

  // Validate at least one field is provided
  if (Object.keys(updateData).length === 0) {
    const error = new Error('At least one field must be provided');
    error.statusCode = 400;
    throw error;
  }

  // Business rules
  if (updateData.status === 'offline') {
    updateData.currentOrderId = null;
  }

  if (updateData.status === 'busy' && !rider.currentOrderId) {
    const error = new Error('Cannot set status to busy without current order');
    error.statusCode = 400;
    throw error;
  }

  // Update fields
  if (updateData.name !== undefined) rider.name = updateData.name;
  if (updateData.status !== undefined) rider.status = updateData.status;
  if (updateData.zone !== undefined) rider.zone = updateData.zone;

  await rider.save();
  return rider.toObject();
};

const getRiderLocation = async (riderId) => {
  const rider = await Rider.findOne({ id: riderId }).select('location').lean();
  
  if (!rider) {
    // In development mode, return mock location data for testing
    if (appConfig.nodeEnv === 'development') {
      return {
        lat: 40.7128,
        lng: -74.0060
      };
    }
    
    const error = new Error('Rider not found');
    error.statusCode = 404;
    throw error;
  }

  if (!rider.location) {
    // In development mode, return mock location if not available
    if (appConfig.nodeEnv === 'development') {
      return {
        lat: 40.7128,
        lng: -74.0060
      };
    }
    
    const error = new Error('Rider location not available');
    error.statusCode = 404;
    throw error;
  }

  return rider.location;
};

const getRiderDistribution = async () => {
  const riders = await Rider.find({
    status: { $in: ['idle', 'busy'] },
  }).select('id name status location').lean();

  const idleRiders = riders.filter(r => r.status === 'idle').length;
  const busyRiders = riders.filter(r => r.status === 'busy').length;

  return {
    idleRiders,
    busyRiders,
    totalRiders: idleRiders + busyRiders,
    riders: riders.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      location: r.location,
    })),
  };
};

const searchRiders = async (query, limit = 10) => {
  const searchRegex = { $regex: query, $options: 'i' };
  
  const riders = await Rider.find({
    $or: [
      { id: searchRegex },
      { name: searchRegex },
    ],
  })
    .limit(limit)
    .lean();

  return riders;
};

const createRider = async (riderData) => {
  const { name, email, phone, zone, location, capacity, status } = riderData;

  // Generate unique rider ID
  const lastRider = await Rider.findOne().sort({ id: -1 }).lean();
  const lastId = lastRider ? parseInt(lastRider.id.split('-')[1]) : 0;
  const newId = `RIDER-${String(lastId + 1).padStart(4, '0')}`;

  // Generate avatar initials from name
  const nameParts = name.trim().split(/\s+/);
  const avatarInitials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase().slice(0, 2)
    : nameParts[0].slice(0, 2).toUpperCase();

  // Create operational rider with defaults
  const rider = new Rider({
    id: newId,
    name: name.trim(),
    avatarInitials,
    status: status || 'offline',
    currentOrderId: null,
    location: location || null,
    capacity: {
      currentLoad: 0,
      maxLoad: capacity?.maxLoad || 5,
    },
    avgEtaMins: 0,
    rating: 0,
    zone: zone || null,
  });

  await rider.save();

  // Also create HR record for consistency (Administrative Data)
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  const riderHR = new RiderHR({
    id: newId,
    name: name.trim(),
    phone: phone || '+0000000000', // Placeholder if not provided (though validation should catch it)
    email: email || `rider.${newId.toLowerCase()}@example.com`, // Placeholder
    status: status === 'offline' ? 'onboarding' : 'active',
    onboardingStatus: status === 'offline' ? 'invited' : 'approved',
    trainingStatus: status === 'offline' ? 'not_started' : 'completed',
    appAccess: status === 'offline' ? 'disabled' : 'enabled',
    deviceAssigned: false,
    contract: {
      startDate,
      endDate,
      renewalDue: false,
    },
    compliance: {
      isCompliant: true,
      lastAuditDate: new Date(),
      policyViolationsCount: 0,
    },
  });

  await riderHR.save();

  // Create default training record
  const training = new Training({
    riderId: newId,
    riderName: name.trim(),
    status: status === 'offline' ? 'not_started' : 'completed',
    modules: [
      { id: 'MOD-001', name: 'Safety Protocols', completed: status !== 'offline' },
      { id: 'MOD-002', name: 'Traffic Rules', completed: status !== 'offline' },
      { id: 'MOD-003', name: 'Customer Service', completed: status !== 'offline' },
      { id: 'MOD-004', name: 'App Usage', completed: status !== 'offline' },
      { id: 'MOD-005', name: 'Emergency Procedures', completed: status !== 'offline' },
    ],
    modulesCompleted: status === 'offline' ? 0 : 5,
    totalModules: 5,
    progressPercentage: status === 'offline' ? 0 : 100,
  });

  await training.save();

  // Create compliance record
  const compliance = new Compliance({
    riderId: newId,
    riderName: name.trim(),
    isCompliant: true,
    lastAuditDate: new Date(),
    policyViolationsCount: 0,
    suspension: { isSuspended: false },
  });

  await compliance.save();

  // Create contract record
  const contractRecord = new Contract({
    riderId: newId,
    riderName: name.trim(),
    startDate,
    endDate,
    renewalDue: false,
    status: 'active',
  });

  await contractRecord.save();

  // Create Staff record for Shift Management
  const staff = new Staff({
    id: newId,
    name: name.trim(),
    role: 'Rider',
    zone: zone || null,
    status: status === 'offline' ? 'Offline' : 'Active',
    currentShift: null,
    currentTask: null,
  });

  await staff.save();

  return rider.toObject();
};

module.exports = {
  listRiders,
  getRiderById,
  updateRider,
  getRiderLocation,
  getRiderDistribution,
  searchRiders,
  createRider,
};

