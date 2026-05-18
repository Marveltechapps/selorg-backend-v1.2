/**
 * Picker Wallet Routes
 * File: src/routes/api/v1/picker/wallet.routes.js
 *
 * P2.1: Picker wallet/earnings management
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');

/**
 * GET /api/v1/picker/wallet/transactions
 * (Declared before '/' if needed — here path is /transactions under wallet mount)
 */
router.get('/transactions', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const transactions = [
      {
        transactionId: 'txn_1',
        type: 'EARNINGS',
        amount: 50.0,
        timestamp: '2026-05-01T10:00:00Z',
        description: 'Order #order_123',
      },
    ];
    res
      .status(200)
      .json(
        ResponseFormatter.paginated(transactions, transactions.length, page, limit, {
          message: 'Wallet transactions',
        })
      );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/picker/wallet
 * Get wallet balance
 */
router.get('/', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const data = {
      userId: req.user.userId,
      balance: 5000.5,
      currency: 'USD',
      lastUpdated: new Date().toISOString(),
    };
    res.status(200).json(ResponseFormatter.success({ wallet: data }, 'Wallet balance'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/picker/wallet/withdraw
 * Request withdrawal
 */
router.post('/withdraw', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const { amount, accountId } = req.body;

    if (!amount || !accountId) {
      return res
        .status(422)
        .json(
          ResponseFormatter.validationError([
            { field: 'amount', message: 'Amount and accountId required' },
            { field: 'accountId', message: 'Amount and accountId required' },
          ])
        );
    }

    if (amount <= 0) {
      return res
        .status(422)
        .json(ResponseFormatter.validationError([{ field: 'amount', message: 'Amount must be greater than 0' }]));
    }

    const data = {
      withdrawalId: 'withdraw_123',
      amount,
      status: 'PROCESSING',
    };
    res.status(200).json(ResponseFormatter.success(data, 'Withdrawal requested'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
