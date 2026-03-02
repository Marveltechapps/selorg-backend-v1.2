const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getBalance,
  getTransactions,
  debitForCheckout,
} = require('../controllers/walletController');

const router = Router();

router.get('/balance', auth, getBalance);
router.get('/transactions', auth, getTransactions);
router.post('/debit', auth, debitForCheckout);

module.exports = router;
