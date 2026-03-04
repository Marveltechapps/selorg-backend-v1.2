/**
 * Wallet controller – from frontend YAML (wallet.service.ts endpoints).
 */
const walletService = require('../services/wallet.service');
const withdrawalRequestService = require('../services/withdrawalRequest.service');
const { success, error } = require('../utils/response.util');

const getBalance = async (req, res, next) => {
  try {
    const data = await walletService.getBalance(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const result = await walletService.withdraw(req.userId, req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const data = await walletService.getHistory(req.userId, req.query);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getTransactionById = async (req, res, next) => {
  try {
    const data = await walletService.getTransactionById(req.userId, req.params.transactionId);
    if (!data) return error(res, 'Not found', 404);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getEarningsBreakdown = async (req, res, next) => {
  try {
    const data = await walletService.getEarningsBreakdown(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getWithdrawalRequest = async (req, res, next) => {
  try {
    const wr = await withdrawalRequestService.getByIdForPicker(req.params.requestId, req.userId);
    if (!wr) return error(res, 'Not found', 404);
    const statusMap = { PENDING: 'pending', APPROVED: 'processing', PAID: 'completed', REJECTED: 'failed' };
    success(res, {
      id: wr._id.toString(),
      withdrawalRequestId: wr._id.toString(),
      status: statusMap[wr.status] || wr.status.toLowerCase(),
      amount: wr.amount,
      requestedAt: wr.requestedAt,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBalance,
  withdraw,
  getHistory,
  getTransactionById,
  getEarningsBreakdown,
  getWithdrawalRequest,
};
