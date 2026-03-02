const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getMethods,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
  setDefaultMethod,
} = require('../controllers/paymentsController');

const router = Router();
router.get('/methods', auth, getMethods);
router.post('/methods', auth, addPaymentMethod);
router.put('/methods/:id', auth, updatePaymentMethod);
router.delete('/methods/:id', auth, removePaymentMethod);
router.post('/methods/:id/default', auth, setDefaultMethod);

module.exports = router;
