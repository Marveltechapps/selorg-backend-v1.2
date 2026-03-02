const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  list,
  getDetail,
  create,
  cancel,
  status,
  rate,
  verifyOtp,
  canCancel,
  active,
  updateStatus,
} = require('../controllers/ordersController');
const { invoice } = require('../controllers/invoiceController');
const { authenticateToken } = require('../../core/middleware');

const router = Router();
router.get('/active', auth, active);
router.get('/', auth, list);
router.get('/:id', auth, getDetail);
router.get('/:id/invoice', auth, invoice);
router.post('/', auth, create);
router.post('/:id/cancel', auth, cancel);
router.get('/:id/can-cancel', auth, canCancel);
router.get('/:id/status', auth, status);
router.post('/:id/rate', auth, rate);
router.post('/:id/verify-otp', auth, verifyOtp);
router.put('/:id/update-status', authenticateToken, updateStatus);

module.exports = router;
