const Contract = require('../models/Contract');
const RiderHR = require('../models/RiderHR');
const logger = require('../../core/utils/logger');

const listContracts = async (filters = {}, pagination = {}) => {
  try {
    const { renewalDue, riderId, page = 1, limit = 50 } = { ...filters, ...pagination };

    const query = {};

    if (renewalDue !== undefined) {
      query.renewalDue = renewalDue;
    }

    if (riderId) {
      query.riderId = riderId;
    }

    const skip = (page - 1) * limit;
    const total = await Contract.countDocuments(query);

    const contracts = await Contract.find(query)
      .sort({ endDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format dates
    const formattedContracts = contracts.map(c => ({
      riderId: c.riderId,
      riderName: c.riderName,
      startDate: c.startDate.toISOString().split('T')[0],
      endDate: c.endDate.toISOString().split('T')[0],
      renewalDue: c.renewalDue,
      status: c.status,
      contractType: c.contractType || null,
      terms: c.terms || null,
    }));

    return {
      contracts: formattedContracts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Error listing contracts:', error);
    throw error;
  }
};

const getRiderContract = async (riderId) => {
  try {
    let contract = await Contract.findOne({ riderId }).lean();

    if (!contract) {
      // Get from rider if contract doesn't exist separately
      const rider = await RiderHR.findOne({ id: riderId }).lean();
      if (!rider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      // Create contract from rider data
      contract = {
        riderId: rider.id,
        riderName: rider.name,
        startDate: rider.contract.startDate,
        endDate: rider.contract.endDate,
        renewalDue: rider.contract.renewalDue,
        status: rider.contract.endDate < new Date() ? 'expired' : 'active',
        contractType: null,
        terms: null,
      };
    } else {
      contract = {
        riderId: contract.riderId,
        riderName: contract.riderName,
        startDate: contract.startDate.toISOString().split('T')[0],
        endDate: contract.endDate.toISOString().split('T')[0],
        renewalDue: contract.renewalDue,
        status: contract.status,
        contractType: contract.contractType || null,
        terms: contract.terms || null,
      };
    }

    return contract;
  } catch (error) {
    logger.error('Error getting rider contract:', error);
    throw error;
  }
};

const updateRiderContract = async (riderId, contractData) => {
  try {
    let contract = await Contract.findOne({ riderId });

    if (!contract) {
      // Create new contract
      const rider = await RiderHR.findOne({ id: riderId });
      if (!rider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      contract = new Contract({
        riderId: rider.id,
        riderName: rider.name,
        startDate: contractData.startDate ? new Date(contractData.startDate) : rider.contract.startDate,
        endDate: contractData.endDate ? new Date(contractData.endDate) : rider.contract.endDate,
        renewalDue: contractData.renewalDue !== undefined ? contractData.renewalDue : rider.contract.renewalDue,
        status: 'active',
        contractType: contractData.contractType || null,
        terms: contractData.terms || null,
      });
    } else {
      // Update existing contract
      if (contractData.startDate) {
        contract.startDate = new Date(contractData.startDate);
      }
      if (contractData.endDate) {
        contract.endDate = new Date(contractData.endDate);
      }
      if (contractData.renewalDue !== undefined) {
        contract.renewalDue = contractData.renewalDue;
        // Update status based on renewalDue
        if (contractData.renewalDue) {
          contract.status = 'pending_renewal';
        } else {
          contract.status = 'active';
        }
      }
      if (contractData.contractType !== undefined) {
        contract.contractType = contractData.contractType;
      }
      if (contractData.terms !== undefined) {
        contract.terms = contractData.terms;
      }
    }

    await contract.save();

    // Update rider contract
    await RiderHR.updateOne(
      { id: riderId },
      {
        contract: {
          startDate: contract.startDate,
          endDate: contract.endDate,
          renewalDue: contract.renewalDue,
        },
      }
    );

    return {
      riderId: contract.riderId,
      riderName: contract.riderName,
      startDate: contract.startDate.toISOString().split('T')[0],
      endDate: contract.endDate.toISOString().split('T')[0],
      renewalDue: contract.renewalDue,
      status: contract.status,
      contractType: contract.contractType || null,
      terms: contract.terms || null,
    };
  } catch (error) {
    logger.error('Error updating rider contract:', error);
    throw error;
  }
};

const renewContract = async (riderId, renewalData = {}) => {
  try {
    // Default to 12 months if not specified
    const durationMonths = renewalData.durationMonths || 12;
    const startDate = renewalData.startDate;

    let contract = await Contract.findOne({ riderId });

    if (!contract) {
      // Get current contract from rider
      const rider = await RiderHR.findOne({ id: riderId });
      if (!rider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      contract = new Contract({
        riderId: rider.id,
        riderName: rider.name,
        startDate: rider.contract.startDate,
        endDate: rider.contract.endDate,
        renewalDue: false,
        status: 'active',
      });
    }

    // Calculate new dates
    const newStartDate = startDate ? new Date(startDate) : contract.endDate;
    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(newEndDate.getMonth() + durationMonths);

    contract.startDate = newStartDate;
    contract.endDate = newEndDate;
    contract.renewalDue = false;
    contract.status = 'active';

    await contract.save();

    // Update rider contract
    await RiderHR.updateOne(
      { id: riderId },
      {
        contract: {
          startDate: contract.startDate,
          endDate: contract.endDate,
          renewalDue: false,
        },
      }
    );

    return {
      riderId: contract.riderId,
      riderName: contract.riderName,
      startDate: contract.startDate.toISOString().split('T')[0],
      endDate: contract.endDate.toISOString().split('T')[0],
      renewalDue: contract.renewalDue,
      status: contract.status,
      contractType: contract.contractType || null,
      terms: contract.terms || null,
    };
  } catch (error) {
    logger.error('Error renewing contract:', error);
    throw error;
  }
};

const terminateContract = async (riderId, terminationData = {}) => {
  try {
    let contract = await Contract.findOne({ riderId });

    if (!contract) {
      // Get from rider if contract doesn't exist separately
      const rider = await RiderHR.findOne({ id: riderId });
      if (!rider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      contract = new Contract({
        riderId: rider.id,
        riderName: rider.name,
        startDate: new Date(rider.contract.startDate),
        endDate: new Date(rider.contract.endDate),
        renewalDue: false,
        status: 'active',
      });
    }

    // Set termination date (default to today if not provided)
    const terminationDate = terminationData.terminationDate 
      ? new Date(terminationData.terminationDate)
      : new Date();

    // Update contract status to terminated
    contract.endDate = terminationDate;
    contract.status = 'terminated';
    contract.renewalDue = false;
    contract.terminationReason = terminationData.reason || null;
    contract.terminatedAt = terminationDate;

    await contract.save();

    // Update rider contract
    await RiderHR.updateOne(
      { id: riderId },
      {
        contract: {
          startDate: contract.startDate,
          endDate: terminationDate,
          renewalDue: false,
        },
      }
    );

    return {
      riderId: contract.riderId,
      riderName: contract.riderName,
      startDate: contract.startDate.toISOString().split('T')[0],
      endDate: contract.endDate.toISOString().split('T')[0],
      renewalDue: contract.renewalDue,
      status: contract.status,
      terminationReason: terminationData.reason || null,
      terminatedAt: terminationDate.toISOString(),
    };
  } catch (error) {
    logger.error('Error terminating contract:', error);
    throw error;
  }
};

module.exports = {
  listContracts,
  getRiderContract,
  updateRiderContract,
  renewContract,
  terminateContract,
};

