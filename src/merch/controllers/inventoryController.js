const InventoryService = require('../services/inventoryService');
const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryReservation = require('../models/InventoryReservation');
const StockReconciliation = require('../models/StockReconciliation');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// ===== INVENTORY TRANSACTIONS =====

const recordTransaction = async (req, res, next) => {
  try {
    const result = await InventoryService.recordTransaction(req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(201).json({
      success: true,
      data: result.transaction,
      newBalance: result.newBalance
    });
  } catch (error) {
    next(error);
  }
};

const recordMultipleTransactions = async (req, res, next) => {
  try {
    const { transactions } = req.body;
    
    if (!Array.isArray(transactions)) {
      return next(new ErrorResponse('Transactions must be an array', 400));
    }
    
    const result = await InventoryService.recordMultipleTransactions(transactions);
    
    if (!result.success) {
      return res.status(207).json({
        success: false,
        error: result.error,
        partialResults: result.partialResults,
        failedAtIndex: result.failedAtIndex
      });
    }
    
    res.status(201).json({
      success: true,
      totalCreated: result.totalCreated,
      data: result.transactions
    });
  } catch (error) {
    next(error);
  }
};

const getTransactionHistory = async (req, res, next) => {
  try {
    const { storeId, sku } = req.params;
    const { daysBack = 30 } = req.query;
    
    const result = await InventoryService.getTransactionHistory(storeId, sku, parseInt(daysBack));
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      count: result.count,
      data: result.transactions
    });
  } catch (error) {
    next(error);
  }
};

const approveTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { approvedBy } = req.body;
    
    if (!approvedBy) {
      return next(new ErrorResponse('approvedBy is required', 400));
    }
    
    const result = await InventoryService.approveTransaction(transactionId, approvedBy);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result.transaction
    });
  } catch (error) {
    next(error);
  }
};

// ===== INVENTORY RESERVATIONS =====

const createReservation = async (req, res, next) => {
  try {
    const result = await InventoryService.createReservation(req.body);
    
    if (!result.success) {
      return res.status(409).json({
        success: false,
        error: result.error,
        unavailableItems: result.unavailableItems
      });
    }
    
    res.status(201).json({
      success: true,
      data: result.reservation
    });
  } catch (error) {
    next(error);
  }
};

const confirmReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    
    const result = await InventoryService.confirmReservation(reservationId);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result.reservation
    });
  } catch (error) {
    next(error);
  }
};

const cancelReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { reason } = req.body;
    
    const result = await InventoryService.cancelReservation(reservationId, reason || 'User requested');
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result.reservation
    });
  } catch (error) {
    next(error);
  }
};

const getActiveReservations = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    
    const reservations = await InventoryReservation.getActiveReservationsByStore(storeId);
    
    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations
    });
  } catch (error) {
    next(error);
  }
};

const expireReservations = async (req, res, next) => {
  try {
    const result = await InventoryService.expireReservations();
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      message: `${result.expiredCount} reservations expired`
    });
  } catch (error) {
    next(error);
  }
};

// ===== STOCK RECONCILIATION =====

const createReconciliation = async (req, res, next) => {
  try {
    const result = await InventoryService.createReconciliation(req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(201).json({
      success: true,
      data: result.reconciliation
    });
  } catch (error) {
    next(error);
  }
};

const submitCounts = async (req, res, next) => {
  try {
    const { reconciliationId } = req.params;
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return next(new ErrorResponse('Items must be an array', 400));
    }
    
    const result = await InventoryService.submitCounts(reconciliationId, items);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result.reconciliation,
      summary: result.reconciliation.summary
    });
  } catch (error) {
    next(error);
  }
};

const approveReconciliation = async (req, res, next) => {
  try {
    const { reconciliationId } = req.params;
    const { approvedBy } = req.body;
    
    if (!approvedBy) {
      return next(new ErrorResponse('approvedBy is required', 400));
    }
    
    const result = await InventoryService.approveReconciliation(reconciliationId, approvedBy);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result.reconciliation
    });
  } catch (error) {
    next(error);
  }
};

const getStoreStockReport = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    
    const result = await InventoryService.getStoreStockReport(storeId);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getInventoryHealth = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    
    const result = await InventoryService.getInventoryHealth(storeId);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getPendingReconciliations = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    
    const reconciliations = await StockReconciliation.getPendingReconciliations(storeId);
    
    res.status(200).json({
      success: true,
      count: reconciliations.length,
      data: reconciliations
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  recordTransaction,
  recordMultipleTransactions,
  getTransactionHistory,
  approveTransaction,
  createReservation,
  confirmReservation,
  cancelReservation,
  getActiveReservations,
  expireReservations,
  createReconciliation,
  submitCounts,
  approveReconciliation,
  getStoreStockReport,
  getInventoryHealth,
  getPendingReconciliations
};
