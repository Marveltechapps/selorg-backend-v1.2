const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getMethods,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
  setDefaultMethod,
} = require('../controllers/paymentsController');
const {
  createWorldlineSession,
  completeWorldlinePayment,
  getWorldlineStatus,
  worldlineReturn,
  getPaymentRetryStatus,
  retryPayment,
} = require('../controllers/worldlinePaymentsController');
const { recordFailure } = require('../controllers/paymentRetryController');

const router = Router();
// Worldline / Paynimo returnUrl (NO auth; gateway callback/redirect target)
router.all('/worldline/return', worldlineReturn);

router.get('/methods', auth, getMethods);
router.post('/methods', auth, addPaymentMethod);
router.put('/methods/:id', auth, updatePaymentMethod);
router.delete('/methods/:id', auth, removePaymentMethod);
router.post('/methods/:id/default', auth, setDefaultMethod);

// Worldline / Paynimo (backend-led)
router.post('/worldline/session', auth, createWorldlineSession);
router.post('/worldline/complete', auth, completeWorldlinePayment);
router.get('/worldline/status', auth, getWorldlineStatus);

// Payment retry endpoints (new)
router.get('/:orderId/retry-status', auth, getPaymentRetryStatus);
router.post('/:orderId/retry', auth, retryPayment);
router.post('/record-failure', auth, recordFailure);

module.exports = router;
