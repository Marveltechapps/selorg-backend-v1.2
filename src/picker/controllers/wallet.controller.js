/**
 * Wallet controller – from frontend YAML (wallet.service.ts endpoints).
 */
const walletService = require('../services/wallet.service');
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

module.exports = {
  getBalance,
  withdraw,
  getHistory,
  getTransactionById,
  getEarningsBreakdown,
};
