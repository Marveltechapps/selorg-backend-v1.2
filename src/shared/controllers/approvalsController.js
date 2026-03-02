const approvalsService = require('../services/approvalsService');
const cache = require('../../utils/cache');
const { getCachedOrCompute, hashForKey } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');
const logger = require('../../core/utils/logger');

/**
 * Get approval summary
 */
const getApprovalSummary = async (req, res, next) => {
  try {
    const date = req.query.date;
    const cacheKey = `approvals:summary:${hashForKey({ date })}`;
    const { value: summary } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.approvals,
      () => approvalsService.getApprovalSummary(date),
      res
    );
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

/**
 * List approval queue
 */
const listApprovals = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status || 'pending',
      type: req.query.type,
      requestedBy: req.query.requestedBy,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    };

    const cacheKey = `approvals:queue:${hashForKey(filters)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.approvals,
      () => approvalsService.listApprovals(filters),
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Create approval request
 */
const createApprovalRequest = async (req, res, next) => {
  try {
    const requestData = req.body;

    if (!requestData.type || !requestData.title || !requestData.description) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'type, title, and description are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const approval = await approvalsService.createApprovalRequest(requestData);
    await cache.delByPattern('approvals:*');
    res.status(201).json(approval);
  } catch (error) {
    next(error);
  }
};

/**
 * Get approval by ID
 */
const getApprovalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `approvals:id:${id}`;
    const { value: approval } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.approvals,
      () => approvalsService.getApprovalById(id),
      res
    );
    res.status(200).json(approval);
  } catch (error) {
    if (error.message === 'Approval request not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Approval request not found',
        code: 'APPROVAL_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Approve request
 */
const approveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notes = req.body.notes;

    const approval = await approvalsService.approveRequest(id, notes);
    
    // Invalidate cache
    await cache.delByPattern('approvals:*');
    // If approval affects other entities, invalidate those too
    if (approval.metadata) {
      if (approval.metadata.orderId) {
        await cache.delByPattern('orders:*');
      }
      if (approval.metadata.vehicleId) {
        await cache.delByPattern('fleet:*');
      }
    }
    
    res.status(200).json(approval);
  } catch (error) {
    logger.error('Error in approveRequest controller:', error);
    if (error.message === 'Approval request not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Approval request not found',
        code: 'APPROVAL_NOT_FOUND',
      });
    }
    if (error.message === 'Request has already been processed') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request has already been processed',
        code: 'ALREADY_PROCESSED',
      });
    }
    next(error);
  }
};

/**
 * Reject request
 */
const rejectRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rejectionData = req.body;

    if (!rejectionData.reason) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Rejection reason is required',
        code: 'MISSING_REASON',
      });
    }

    const approval = await approvalsService.rejectRequest(id, rejectionData);
    
    // Invalidate cache
    await cache.delByPattern('approvals:*');
    
    res.status(200).json(approval);
  } catch (error) {
    logger.error('Error in rejectRequest controller:', error);
    if (error.message === 'Approval request not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Approval request not found',
        code: 'APPROVAL_NOT_FOUND',
      });
    }
    if (error.message === 'Request has already been processed') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request has already been processed',
        code: 'ALREADY_PROCESSED',
      });
    }
    next(error);
  }
};

/**
 * Batch approve requests
 */
const batchApprove = async (req, res, next) => {
  try {
    // Support both requestIds and approvalIds for compatibility
    const { requestIds, approvalIds, notes } = req.body;
    const ids = requestIds || approvalIds;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'requestIds or approvalIds array is required',
        code: 'MISSING_REQUEST_IDS',
      });
    }

    const result = await approvalsService.batchApprove(ids, notes);
    
    // Invalidate cache
    await cache.delByPattern('approvals:*');
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in batchApprove controller:', error);
    next(error);
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

