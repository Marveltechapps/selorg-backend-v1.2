/**
 * Wallet routes – from frontend YAML (application-spec paths /wallet/*).
 * Phase 1 RBAC: Dashboard endpoints for withdrawal approve/reject/pay will require Finance role.
 */
const express = require('express');
const walletController = require('../controllers/wallet.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/balance', requireAuth, walletController.getBalance);
router.get('/earnings-breakdown', requireAuth, walletController.getEarningsBreakdown);
router.post('/withdraw', requireAuth, walletController.withdraw);
router.get('/history', requireAuth, walletController.getHistory);
router.get('/transactions/:transactionId', requireAuth, walletController.getTransactionById);
router.get('/withdrawal-requests/:requestId', requireAuth, walletController.getWithdrawalRequest);

module.exports = router;
