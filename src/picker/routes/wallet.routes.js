/**
 * Wallet routes – from frontend YAML (application-spec paths /wallet/*).
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

module.exports = router;
