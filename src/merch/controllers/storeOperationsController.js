const ReplenishmentService = require('../services/replenishmentService');
const ExpiryManagementService = require('../services/expiryManagementService');
const ReplenishmentOrder = require('../models/ReplenishmentOrder');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// ===== REPLENISHMENT ENDPOINTS =====

const analyzeInventoryNeeds = async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const result = await ReplenishmentService.analyzeInventoryNeeds(storeId, req.body);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      analysis: result
    });
  } catch (error) {
    next(error);
  }
};

const createReplenishmentOrder = async (req, res, next) => {
  try {
    const result = await ReplenishmentService.createReplenishmentOrder(req.body);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(201).json({
      success: true,
      data: result.order
    });
  } catch (error) {
    next(error);
  }
};

const submitOrderForApproval = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { submittedBy } = req.body;

    if (!submittedBy) {
      return next(new ErrorResponse('submittedBy is required', 400));
    }

    const result = await ReplenishmentService.submitOrderForApproval(orderId, submittedBy);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.order
    });
  } catch (error) {
    next(error);
  }
};

const approveOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { approvedBy, notes } = req.body;

    if (!approvedBy) {
      return next(new ErrorResponse('approvedBy is required', 400));
    }

    const result = await ReplenishmentService.approveOrder(orderId, approvedBy, notes || '');

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.order
    });
  } catch (error) {
    next(error);
  }
};

const rejectOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return next(new ErrorResponse('reason is required', 400));
    }

    const result = await ReplenishmentService.rejectOrder(orderId, reason);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.order
    });
  } catch (error) {
    next(error);
  }
};

const receiveOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { receivedQuantity, inspectionNotes } = req.body;

    if (!receivedQuantity) {
      return next(new ErrorResponse('receivedQuantity is required', 400));
    }

    const result = await ReplenishmentService.receiveOrder(orderId, receivedQuantity, inspectionNotes || '');

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.order,
      transaction: result.transaction
    });
  } catch (error) {
    next(error);
  }
};

const getPendingApprovals = async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const result = await ReplenishmentService.getPendingApprovals(storeId);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      count: result.count,
      data: result.orders
    });
  } catch (error) {
    next(error);
  }
};

const getPendingDeliveries = async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const result = await ReplenishmentService.getPendingDeliveries(storeId);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      count: result.count,
      data: result.orders
    });
  } catch (error) {
    next(error);
  }
};

// ===== EXPIRY MANAGEMENT ENDPOINTS =====

const checkExpiringBatches = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { daysThreshold = 30 } = req.query;

    const result = await ExpiryManagementService.checkStoreExpiringBatches(
      storeId,
      parseInt(daysThreshold)
    );

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      summary: {
        totalBatches: result.totalExpiringBatches,
        expiring7days: result.expiring7days,
        expiring30days: result.expiring30days
      },
      data: result.batches
    });
  } catch (error) {
    next(error);
  }
};

const sendExpiryAlerts = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { thresholds = [30, 14, 7] } = req.body;

    const result = await ExpiryManagementService.sendExpiryAlerts(storeId, thresholds);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      alertsSent: result.totalAlertsSent,
      data: result.alerts
    });
  } catch (error) {
    next(error);
  }
};

const markBatchForRemoval = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { approvedBy, notes } = req.body;

    if (!approvedBy) {
      return next(new ErrorResponse('approvedBy is required', 400));
    }

    const result = await ExpiryManagementService.markBatchForRemoval(batchId, approvedBy, notes || '');

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.batch
    });
  } catch (error) {
    next(error);
  }
};

const recordBatchRemoval = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { quantityRemoved, notes } = req.body;

    const result = await ExpiryManagementService.recordBatchRemoval(
      batchId,
      quantityRemoved,
      notes || ''
    );

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.batch,
      wasteAmount: result.wasteAmount
    });
  } catch (error) {
    next(error);
  }
};

const recordBatchSale = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { quantitySold, discountPercent } = req.body;

    if (!quantitySold) {
      return next(new ErrorResponse('quantitySold is required', 400));
    }

    const result = await ExpiryManagementService.recordBatchSale(
      batchId,
      quantitySold,
      discountPercent || 0
    );

    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }

    res.status(200).json({
      success: true,
      data: result.batch
    });
  } catch (error) {
    next(error);
  }
};

const getExpiryStatistics = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { days = 30 } = req.query;

    const result = await ExpiryManagementService.getExpiryStatistics(storeId, parseInt(days));

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      data: result.statistics
    });
  } catch (error) {
    next(error);
  }
};

const getWastageReport = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return next(new ErrorResponse('startDate and endDate are required', 400));
    }

    const result = await ExpiryManagementService.calculateWastageReport(
      storeId,
      new Date(startDate),
      new Date(endDate)
    );

    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }

    res.status(200).json({
      success: true,
      data: result.report
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeInventoryNeeds,
  createReplenishmentOrder,
  submitOrderForApproval,
  approveOrder,
  rejectOrder,
  receiveOrder,
  getPendingApprovals,
  getPendingDeliveries,
  checkExpiringBatches,
  sendExpiryAlerts,
  markBatchForRemoval,
  recordBatchRemoval,
  recordBatchSale,
  getExpiryStatistics,
  getWastageReport
};
