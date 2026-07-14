const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getBalance,
  getTransactions,
  debitForCheckout,
  creditForTopUp,
  initiateTopUp,
} = require('../controllers/walletController');

const router = Router();

router.get('/balance', auth, getBalance);
router.get('/transactions', auth, getTransactions);
router.post('/top-up/session', auth, initiateTopUp);
router.post('/credit', auth, creditForTopUp);
router.post('/debit', auth, debitForCheckout);

module.exports = router;
