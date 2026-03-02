const ApprovalRequest = require('../../common-models/ApprovalRequest');
const logger = require('../../core/utils/logger');

/**
 * Get approval summary
 */
const getApprovalSummary = async (date) => {
  try {
    const today = new Date();
    const targetDate = date ? new Date(date) : today;
    
    // Set range from 00:00:00 to 23:59:59 of the target day
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const pendingCount = await ApprovalRequest.countDocuments({ status: 'pending' });

    // Use updatedAt or approvedAt for counting daily completions
    const approvedToday = await ApprovalRequest.countDocuments({
      status: 'approved',
      $or: [
        { approvedAt: { $gte: startOfDay, $lte: endOfDay } },
        { updatedAt: { $gte: startOfDay, $lte: endOfDay } }
      ]
    });

    const rejectedToday = await ApprovalRequest.countDocuments({
      status: 'rejected',
      $or: [
        { approvedAt: { $gte: startOfDay, $lte: endOfDay } },
        { updatedAt: { $gte: startOfDay, $lte: endOfDay } }
      ]
    });

    return {
      pendingCount: pendingCount ?? 0,
      approvedToday: approvedToday ?? 0,
      rejectedToday: rejectedToday ?? 0,
      date: startOfDay.toISOString().split('T')[0],
    };
  } catch (error) {
    logger.error('Error getting approval summary:', error);
    throw error;
  }
};

/**
 * List approval queue
 */
const listApprovals = async (filters = {}) => {
  try {
    const {
      status = 'pending',
      type,
      requestedBy,
      page = 1,
      limit = 50,
    } = filters;

    const query = {};

    if (status !== 'all') {
      query.status = status;
    }

    if (type) query.type = type;
    if (requestedBy) query.requestedById = requestedBy;

    const skip = (page - 1) * limit;
    const approvals = await ApprovalRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ApprovalRequest.countDocuments(query);

    return {
      approvals,
      total,
      page,
      limit,
    };
  } catch (error) {
    logger.error('Error listing approvals:', error);
    throw error;
  }
};

/**
 * Create approval request
 */
const createApprovalRequest = async (requestData) => {
  try {
    const approval = new ApprovalRequest({
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: requestData.type,
      title: requestData.title,
      description: requestData.description,
      reason: requestData.reason,
      requestedBy: 'User', // In real app, get from auth
      requestedById: 'user-1', // In real app, get from auth
      requesterRole: 'Rider',
      status: 'pending',
      metadata: requestData.metadata || {},
    });

    await approval.save();
    return approval.toObject();
  } catch (error) {
    logger.error('Error creating approval request:', error);
    throw error;
  }
};

/**
 * Get approval by ID
 */
const getApprovalById = async (approvalId) => {
  try {
    const approval = await ApprovalRequest.findOne({ id: approvalId }).lean();
    if (!approval) {
      throw new Error('Approval request not found');
    }
    return approval;
  } catch (error) {
    logger.error('Error getting approval by ID:', error);
    throw error;
  }
};

/**
 * Approve request
 */
const approveRequest = async (approvalId, notes) => {
  try {
    const approval = await ApprovalRequest.findOne({ id: approvalId });
    if (!approval) {
      throw new Error('Approval request not found');
    }

    if (approval.status !== 'pending') {
      throw new Error('Request has already been processed');
    }

    approval.status = 'approved';
    approval.approvedBy = 'Admin'; // In real app, get from auth
    approval.approvedById = 'admin-1'; // In real app, get from auth
    approval.approvedAt = new Date();
    if (notes) {
      approval.metadata = { ...approval.metadata, approvalNotes: notes };
    }

    await approval.save();
    return approval.toObject();
  } catch (error) {
    logger.error('Error approving request:', error);
    throw error;
  }
};

/**
 * Reject request
 */
const rejectRequest = async (approvalId, rejectionData) => {
  try {
    const approval = await ApprovalRequest.findOne({ id: approvalId });
    if (!approval) {
      throw new Error('Approval request not found');
    }

    if (approval.status !== 'pending') {
      throw new Error('Request has already been processed');
    }

    approval.status = 'rejected';
    approval.approvedBy = 'Admin'; // In real app, get from auth
    approval.approvedById = 'admin-1'; // In real app, get from auth
    approval.approvedAt = new Date();
    approval.rejectionReason = rejectionData.reason;
    if (rejectionData.notes) {
      approval.metadata = { ...approval.metadata, rejectionNotes: rejectionData.notes };
    }

    await approval.save();
    return approval.toObject();
  } catch (error) {
    logger.error('Error rejecting request:', error);
    throw error;
  }
};

/**
 * Batch approve requests
 */
const batchApprove = async (approvalIds, notes) => {
  try {
    const results = [];
    let approved = 0;
    let failed = 0;

    for (const approvalId of approvalIds) {
      try {
        const approval = await ApprovalRequest.findOne({ id: approvalId });
        if (!approval) {
          results.push({
            approvalId,
            status: 'failed',
            error: 'Approval request not found',
          });
          failed++;
          continue;
        }

        if (approval.status !== 'pending') {
          results.push({
            approvalId,
            status: 'failed',
            error: 'Request has already been processed',
          });
          failed++;
          continue;
        }

        approval.status = 'approved';
        approval.approvedBy = 'Admin';
        approval.approvedById = 'admin-1';
        approval.approvedAt = new Date();
        if (notes) {
          approval.metadata = { ...approval.metadata, approvalNotes: notes };
        }

        await approval.save();
        results.push({
          approvalId,
          status: 'approved',
        });
        approved++;
      } catch (error) {
        results.push({
          approvalId,
          status: 'failed',
          error: error.message,
        });
        failed++;
      }
    }

    return {
      approved,
      failed,
      results,
    };
  } catch (error) {
    logger.error('Error batch approving requests:', error);
    throw error;
  }
};

module.exports = {
  getApprovalSummary,
  listApprovals,
  createApprovalRequest,
  getApprovalById,
  approveRequest,
  rejectRequest,
  batchApprove,
};

