const Compliance = require('../models/Compliance');
const RiderHR = require('../models/RiderHR');
const logger = require('../../core/utils/logger');

const listComplianceAlerts = async (filters = {}, pagination = {}) => {
  try {
    const { status, riderId, page = 1, limit = 50 } = { ...filters, ...pagination };

    const query = {};

    if (status) {
      if (status === 'non_compliant') {
        query.isCompliant = false;
      } else if (status === 'compliant') {
        query.isCompliant = true;
      }
    }

    if (riderId) {
      query.riderId = riderId;
    }

    const skip = (page - 1) * limit;
    const total = await Compliance.countDocuments(query);

    const compliances = await Compliance.find(query)
      .sort({ lastAuditDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format as ComplianceAlert
    const alerts = compliances.map(c => {
      const issue = c.suspension?.isSuspended
        ? `Suspended: ${c.suspension.reason || 'Unknown'}`
        : `Policy Violation (${c.policyViolationsCount})`;

      return {
        riderId: c.riderId,
        riderName: c.riderName,
        issue,
        issueType: c.suspension?.isSuspended ? 'suspension' : 'policy_violation',
        lastAuditDate: c.lastAuditDate.toISOString().split('T')[0],
        status: c.isCompliant ? 'compliant' : 'non_compliant',
        suspension: c.suspension || null,
        policyViolationsCount: c.policyViolationsCount,
      };
    });

    return {
      alerts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Error listing compliance alerts:', error);
    throw error;
  }
};

const getRiderSuspension = async (riderId) => {
  try {
    const compliance = await Compliance.findOne({ riderId }).lean();

    if (!compliance) {
      const error = new Error('Rider compliance record not found');
      error.statusCode = 404;
      throw error;
    }

    return {
      riderId: compliance.riderId,
      riderName: compliance.riderName,
      isSuspended: compliance.suspension?.isSuspended || false,
      reason: compliance.suspension?.reason || null,
      since: compliance.suspension?.since || null,
      durationDays: compliance.suspension?.durationDays || null,
      expiresAt: compliance.suspension?.expiresAt || null,
    };
  } catch (error) {
    logger.error('Error getting rider suspension:', error);
    throw error;
  }
};

const manageSuspension = async (riderId, suspensionData) => {
  try {
    const { action, reason, durationDays } = suspensionData;

    if (!['suspend', 'unsuspend'].includes(action)) {
      const error = new Error('Invalid action');
      error.statusCode = 400;
      throw error;
    }

    let compliance = await Compliance.findOne({ riderId });

    if (!compliance) {
      // Create compliance record if it doesn't exist
      const rider = await RiderHR.findOne({ id: riderId });
      if (!rider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      compliance = new Compliance({
        riderId: rider.id,
        riderName: rider.name,
        isCompliant: true,
        lastAuditDate: new Date(),
        policyViolationsCount: 0,
        suspension: {
          isSuspended: false,
        },
      });
    }

    if (action === 'suspend') {
      if (!reason) {
        const error = new Error('Reason is required for suspension');
        error.statusCode = 400;
        throw error;
      }

      const since = new Date();
      let expiresAt = null;

      if (durationDays) {
        expiresAt = new Date(since);
        expiresAt.setDate(expiresAt.getDate() + durationDays);
      }

      compliance.suspension = {
        isSuspended: true,
        reason,
        since,
        durationDays: durationDays || null,
        expiresAt,
      };

      compliance.isCompliant = false;

      // Update rider status
      await RiderHR.updateOne(
        { id: riderId },
        { 
          status: 'suspended',
          suspension: compliance.suspension,
        }
      );
    } else if (action === 'unsuspend') {
      compliance.suspension = {
        isSuspended: false,
        reason: null,
        since: null,
        durationDays: null,
        expiresAt: null,
      };

      compliance.isCompliant = compliance.policyViolationsCount === 0;

      // Update rider status
      await RiderHR.updateOne(
        { id: riderId },
        { 
          status: 'active',
          'suspension.isSuspended': false,
        }
      );
    }

    await compliance.save();

    return {
      riderId: compliance.riderId,
      riderName: compliance.riderName,
      isSuspended: compliance.suspension.isSuspended,
      reason: compliance.suspension.reason,
      since: compliance.suspension.since,
      durationDays: compliance.suspension.durationDays,
      expiresAt: compliance.suspension.expiresAt,
    };
  } catch (error) {
    logger.error('Error managing suspension:', error);
    throw error;
  }
};

const getRiderViolations = async (riderId) => {
  try {
    const compliance = await Compliance.findOne({ riderId }).lean();

    if (!compliance) {
      const error = new Error('Rider compliance record not found');
      error.statusCode = 404;
      throw error;
    }

    return {
      riderId: compliance.riderId,
      violations: compliance.violations || [],
    };
  } catch (error) {
    logger.error('Error getting rider violations:', error);
    throw error;
  }
};

module.exports = {
  listComplianceAlerts,
  getRiderSuspension,
  manageSuspension,
  getRiderViolations,
};

