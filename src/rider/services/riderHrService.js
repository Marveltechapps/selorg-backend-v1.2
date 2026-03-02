const RiderHR = require('../models/RiderHR');
const Rider = require('../models/Rider');
const Training = require('../models/Training');
const Compliance = require('../models/Compliance');
const Contract = require('../models/Contract');
const logger = require('../../core/utils/logger');

const listRiders = async (filters = {}, pagination = {}) => {
  try {
    const {
      status,
      onboardingStatus,
      trainingStatus,
      appAccess,
      page = 1,
      limit = 50,
    } = { ...filters, ...pagination };

    const query = {};

    if (status) {
      query.status = status;
    }

    if (onboardingStatus) {
      query.onboardingStatus = onboardingStatus;
    }

    if (trainingStatus) {
      query.trainingStatus = trainingStatus;
    }

    if (appAccess) {
      query.appAccess = appAccess;
    }

    const skip = (page - 1) * limit;
    const total = await RiderHR.countDocuments(query);

    const riders = await RiderHR.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get contract statuses from Contract collection
    const riderIds = riders.map(r => r.id);
    const contracts = await Contract.find({ riderId: { $in: riderIds } }).lean();
    const contractMap = new Map(contracts.map(c => [c.riderId, c]));

    // Format dates
    const formattedRiders = riders.map(r => {
      const contract = contractMap.get(r.id);
      // Determine contract status: prefer Contract collection status, fallback to calculated status
      let contractStatus = contract?.status;
      if (!contractStatus) {
        const now = new Date();
        const endDate = r.contract?.endDate;
        if (endDate && endDate < now) {
          contractStatus = 'expired';
        } else if (r.contract?.renewalDue) {
          contractStatus = 'pending_renewal';
        } else {
          contractStatus = 'active';
        }
      }
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        status: r.status,
        onboardingStatus: r.onboardingStatus,
        trainingStatus: r.trainingStatus,
        appAccess: r.appAccess,
        deviceAssigned: r.deviceAssigned,
        deviceId: r.deviceId || null,
        deviceType: r.deviceType || null,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        contract: {
          startDate: r.contract?.startDate ? r.contract.startDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          endDate: r.contract?.endDate ? r.contract.endDate.toISOString().split('T')[0] : new Date(Date.now() + 31536000000).toISOString().split('T')[0],
          renewalDue: r.contract?.renewalDue || false,
          status: contractStatus,
        },
        compliance: {
          isCompliant: r.compliance?.isCompliant ?? true,
          lastAuditDate: r.compliance?.lastAuditDate ? r.compliance.lastAuditDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          policyViolationsCount: r.compliance?.policyViolationsCount || 0,
          lastViolationReason: r.compliance?.lastViolationReason || null,
        },
        suspension: r.suspension ? {
          isSuspended: r.suspension.isSuspended,
          reason: r.suspension.reason || null,
          since: r.suspension.since ? r.suspension.since.toISOString() : null,
        } : null,
      };
    });

    return {
      riders: formattedRiders,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Error listing riders:', error);
    throw error;
  }
};

const getRiderDetails = async (riderId) => {
  try {
    const rider = await RiderHR.findOne({ id: riderId }).lean();

    if (!rider) {
      const error = new Error('Rider not found');
      error.statusCode = 404;
      throw error;
    }

    // Get contract status from Contract collection
    const contract = await Contract.findOne({ riderId: rider.id }).lean();
    
    // Determine contract status: prefer Contract collection status, fallback to calculated status
    let contractStatus = contract?.status;
    if (!contractStatus) {
      const now = new Date();
      const endDate = rider.contract.endDate;
      if (endDate < now) {
        contractStatus = 'expired';
      } else if (rider.contract.renewalDue) {
        contractStatus = 'pending_renewal';
      } else {
        contractStatus = 'active';
      }
    }

    return {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      email: rider.email,
      status: rider.status,
      onboardingStatus: rider.onboardingStatus,
      trainingStatus: rider.trainingStatus,
      appAccess: rider.appAccess,
      deviceAssigned: rider.deviceAssigned,
      deviceId: rider.deviceId || null,
      deviceType: rider.deviceType || null,
      createdAt: rider.createdAt ? rider.createdAt.toISOString() : null, // Include createdAt for days active calculation
      contract: {
        startDate: rider.contract.startDate.toISOString().split('T')[0],
        endDate: rider.contract.endDate.toISOString().split('T')[0],
        renewalDue: rider.contract.renewalDue,
        status: contractStatus, // Include contract status
      },
      compliance: {
        isCompliant: rider.compliance.isCompliant,
        lastAuditDate: rider.compliance.lastAuditDate.toISOString().split('T')[0],
        policyViolationsCount: rider.compliance.policyViolationsCount,
        lastViolationReason: rider.compliance.lastViolationReason || null,
      },
      suspension: rider.suspension ? {
        isSuspended: rider.suspension.isSuspended,
        reason: rider.suspension.reason || null,
        since: rider.suspension.since ? rider.suspension.since.toISOString() : null,
      } : null,
    };
  } catch (error) {
    logger.error('Error getting rider details:', error);
    throw error;
  }
};

const onboardRider = async (riderData) => {
  try {
    const { name, phone, email, contract } = riderData;

    // Generate rider ID
    const lastRider = await RiderHR.findOne().sort({ id: -1 }).lean();
    const lastId = lastRider ? parseInt(lastRider.id.split('-')[1]) : 0;
    const newId = `RIDER-${String(lastId + 1).padStart(4, '0')}`;

    // Set default contract dates
    const startDate = contract?.startDate ? new Date(contract.startDate) : new Date();
    const endDate = contract?.endDate ? new Date(contract.endDate) : new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    // Create rider
    const rider = new RiderHR({
      id: newId,
      name,
      phone,
      email,
      status: 'onboarding',
      onboardingStatus: 'invited',
      trainingStatus: 'not_started',
      appAccess: 'disabled',
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

    await rider.save();

    // Also create operational rider record for consistency
    const nameParts = name.trim().split(/\s+/);
    const avatarInitials = nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase().slice(0, 2)
      : nameParts[0].slice(0, 2).toUpperCase();

    const operationalRider = new Rider({
      id: newId,
      name: name.trim(),
      avatarInitials,
      status: 'offline', // Start as offline until onboarding is complete
      currentOrderId: null,
      location: null,
      capacity: {
        currentLoad: 0,
        maxLoad: 5,
      },
      avgEtaMins: 0,
      rating: 0,
      zone: null,
    });

    await operationalRider.save();

    // Create default training record
    const defaultModules = [
      { id: 'MOD-001', name: 'Safety Protocols', completed: false },
      { id: 'MOD-002', name: 'Traffic Rules', completed: false },
      { id: 'MOD-003', name: 'Customer Service', completed: false },
      { id: 'MOD-004', name: 'App Usage', completed: false },
      { id: 'MOD-005', name: 'Emergency Procedures', completed: false },
    ];

    const training = new Training({
      riderId: rider.id,
      riderName: rider.name,
      status: 'not_started',
      modules: defaultModules,
      modulesCompleted: 0,
      totalModules: 5,
      progressPercentage: 0,
    });

    await training.save();

    // Create compliance record
    const compliance = new Compliance({
      riderId: rider.id,
      riderName: rider.name,
      isCompliant: true,
      lastAuditDate: new Date(),
      policyViolationsCount: 0,
      suspension: {
        isSuspended: false,
      },
    });

    await compliance.save();

    // Create contract record
    const contractRecord = new Contract({
      riderId: rider.id,
      riderName: rider.name,
      startDate,
      endDate,
      renewalDue: false,
      status: 'active',
    });

    await contractRecord.save();

    return {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      email: rider.email,
      status: rider.status,
      onboardingStatus: rider.onboardingStatus,
      trainingStatus: rider.trainingStatus,
      appAccess: rider.appAccess,
      deviceAssigned: rider.deviceAssigned,
      contract: {
        startDate: rider.contract.startDate.toISOString().split('T')[0],
        endDate: rider.contract.endDate.toISOString().split('T')[0],
        renewalDue: rider.contract.renewalDue,
      },
      compliance: {
        isCompliant: rider.compliance.isCompliant,
        lastAuditDate: rider.compliance.lastAuditDate.toISOString().split('T')[0],
        policyViolationsCount: rider.compliance.policyViolationsCount,
      },
    };
  } catch (error) {
    logger.error('Error onboarding rider:', error);
    if (error.code === 11000) {
      const duplicateError = new Error('Rider with this ID already exists');
      duplicateError.statusCode = 400;
      throw duplicateError;
    }
    throw error;
  }
};

const updateRider = async (riderId, updateData) => {
  try {
    const rider = await RiderHR.findOne({ id: riderId });

    if (!rider) {
      const error = new Error('Rider not found');
      error.statusCode = 404;
      throw error;
    }

    // Update allowed fields
    if (updateData.appAccess !== undefined) {
      rider.appAccess = updateData.appAccess;
    }
    if (updateData.trainingStatus !== undefined) {
      rider.trainingStatus = updateData.trainingStatus;
    }
    if (updateData.status !== undefined) {
      rider.status = updateData.status;
      
      // Keep operational rider status in sync
      if (updateData.status === 'suspended') {
        await Rider.updateOne({ id: riderId }, { $set: { status: 'offline' } });
      }
    }
    if (updateData.onboardingStatus !== undefined) {
      rider.onboardingStatus = updateData.onboardingStatus;
      
      // If onboarding is approved, ensure the operational rider exists 
      // and is ready to be moved to idle/online
      if (updateData.onboardingStatus === 'approved') {
        await Rider.updateOne(
          { id: riderId }, 
          { $set: { status: 'offline' } }, // Keep offline until login, but ensure record exists
          { upsert: true }
        );
      }
    }

    await rider.save();

    // Sync other basic info if updated
    const operationalUpdate = {};
    if (updateData.name) operationalUpdate.name = updateData.name;
    
    if (Object.keys(operationalUpdate).length > 0) {
      await Rider.updateOne({ id: riderId }, { $set: operationalUpdate });
    }

    return getRiderDetails(riderId);
  } catch (error) {
    logger.error('Error updating rider:', error);
    throw error;
  }
};

const sendReminder = async (riderId) => {
  try {
    const rider = await RiderHR.findOne({ id: riderId }).lean();

    if (!rider) {
      const error = new Error('Rider not found');
      error.statusCode = 404;
      throw error;
    }

    // In a real application, this would:
    // 1. Send an email/SMS notification
    // 2. Log the reminder in the system
    // 3. Update reminder tracking
    // For now, we'll just return success with reminder details

    return {
      success: true,
      riderId: rider.id,
      riderName: rider.name,
      email: rider.email,
      phone: rider.phone,
      message: 'Reminder sent successfully',
      sentAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error sending reminder:', error);
    throw error;
  }
};

module.exports = {
  listRiders,
  getRiderDetails,
  onboardRider,
  updateRider,
  sendReminder,
};

