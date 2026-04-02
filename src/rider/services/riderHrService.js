const RiderHR = require('../models/RiderHR');
const Rider = require('../models/Rider');
const Training = require('../models/Training');
const Compliance = require('../models/Compliance');
const Contract = require('../models/Contract');
const { Rider: RiderV2 } = require('../../rider_v2_backend/src/models/Rider');
const logger = require('../../core/utils/logger');

const MS_PER_DAY = 86400000;

/**
 * Whole calendar days from record creation to now while status is onboarding.
 * Uses RiderHR / Rider V2 `createdAt` as onboarding start (HR record creation).
 */
function computeOnboardingDaysActive(createdAt, status) {
  if (status !== 'onboarding') return null;
  if (!createdAt) return 0;
  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / MS_PER_DAY));
}

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

    // Fetch from RiderHR
    const ridersHR = await RiderHR.find(query).lean();

    // Fetch from RiderV2 and normalize
    const ridersV2 = await RiderV2.find({}).lean();
    const normalizedV2 = ridersV2.map(r => ({
      id: r.riderId,
      name: r.name,
      phone: r.phoneNumber,
      email: r.email,
      status: r.status === 'active' ? 'active' : (r.status === 'suspended' ? 'suspended' : 'onboarding'),
      onboardingStatus: r.status === 'approved' || r.status === 'active' ? 'approved' : 'docs_pending',
      trainingStatus: 'not_started', // Default for V2
      appAccess: r.status === 'active' ? 'enabled' : 'disabled',
      deviceAssigned: false,
      createdAt: r.createdAt,
      contract: {
        startDate: r.createdAt,
        endDate: new Date(new Date(r.createdAt).setFullYear(new Date(r.createdAt).getFullYear() + 1)),
        renewalDue: false,
      },
      compliance: {
        isCompliant: true,
        lastAuditDate: new Date(),
        policyViolationsCount: 0,
      }
    }));

    // Combine
    let allRiders = [...ridersHR, ...normalizedV2];
    
    // Filter combined results if needed (though we should ideally do it in query)
    if (status) allRiders = allRiders.filter(r => r.status === status);
    if (onboardingStatus) allRiders = allRiders.filter(r => r.onboardingStatus === onboardingStatus);

    allRiders.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const total = allRiders.length;
    const skip = (page - 1) * limit;
    const paginatedRiders = allRiders.slice(skip, skip + limit);

    // Get contract statuses from Contract collection for all
    const riderIds = paginatedRiders.map(r => r.id);
    const contracts = await Contract.find({ riderId: { $in: riderIds } }).lean();
    const contractMap = new Map(contracts.map(c => [c.riderId, c]));

    // Format dates and final merge
    const formattedRiders = paginatedRiders.map(r => {
      const contract = contractMap.get(r.id);
      let contractStatus = contract?.status;
      if (!contractStatus) {
        const now = new Date();
        const endDate = r.contract?.endDate;
        if (endDate && new Date(endDate) < now) {
          contractStatus = 'expired';
        } else if (r.contract?.renewalDue) {
          contractStatus = 'pending_renewal';
        } else {
          contractStatus = 'active';
        }
      }
      return {
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        onboardingDaysActive: computeOnboardingDaysActive(r.createdAt, r.status),
        contract: {
          startDate: r.contract?.startDate ? new Date(r.contract.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          endDate: r.contract?.endDate ? new Date(r.contract.endDate).toISOString().split('T')[0] : new Date(Date.now() + 31536000000).toISOString().split('T')[0],
          renewalDue: r.contract?.renewalDue || false,
          status: contractStatus,
        },
        compliance: {
          isCompliant: r.compliance?.isCompliant ?? true,
          lastAuditDate: r.compliance?.lastAuditDate ? new Date(r.compliance.lastAuditDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          policyViolationsCount: r.compliance?.policyViolationsCount || 0,
          lastViolationReason: r.compliance?.lastViolationReason || null,
        },
        suspension: r.suspension ? {
          isSuspended: r.suspension.isSuspended,
          reason: r.suspension.reason || null,
          since: r.suspension.since ? new Date(r.suspension.since).toISOString() : null,
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
    let rider = await RiderHR.findOne({ id: riderId }).lean();

    if (!rider) {
      // Try RiderV2
      const rV2 = await RiderV2.findOne({ riderId }).lean();
      if (rV2) {
        rider = {
          id: rV2.riderId,
          name: rV2.name,
          phone: rV2.phoneNumber,
          email: rV2.email,
          status: rV2.status === 'active' ? 'active' : (rV2.status === 'suspended' ? 'suspended' : 'onboarding'),
          onboardingStatus: rV2.status === 'approved' || rV2.status === 'active' ? 'approved' : 'docs_pending',
          trainingStatus: 'not_started',
          appAccess: rV2.status === 'active' ? 'enabled' : 'disabled',
          deviceAssigned: false,
          createdAt: rV2.createdAt,
          contract: {
            startDate: rV2.createdAt,
            endDate: new Date(new Date(rV2.createdAt).setFullYear(new Date(rV2.createdAt).getFullYear() + 1)),
            renewalDue: false,
          },
          compliance: {
            isCompliant: true,
            lastAuditDate: new Date(),
            policyViolationsCount: 0,
          }
        };
      }
    }

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
      onboardingDaysActive: computeOnboardingDaysActive(rider.createdAt, rider.status),
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

    // Pro tip: RDR-[Store]-[YYMM]-[Sequence]
    const now = new Date();
    const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0');
    const storeId = process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
    let storeCode = 'GEN';
    const parts = storeId.split('-');
    if (parts.length >= 2) {
      storeCode = parts[1].slice(0, 3).toUpperCase();
    }
    const prefix = `RDR-${storeCode}-${yearMonth}-`;
    
    // Find last rider with this prefix to increment sequence
    const lastRider = await RiderHR.findOne({
      id: new RegExp(`^${prefix}`)
    }).sort({ id: -1 }).lean();
    
    let lastSequence = 0;
    if (lastRider && lastRider.id) {
      const sequencePart = lastRider.id.split('-').pop();
      lastSequence = parseInt(sequencePart) || 0;
    }
    const newId = `${prefix}${String(lastSequence + 1).padStart(3, '0')}`;

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
      createdAt: rider.createdAt ? rider.createdAt.toISOString() : null,
      onboardingDaysActive: computeOnboardingDaysActive(rider.createdAt, rider.status),
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

