const { Router } = require('express');
const auth = require('../middleware/auth');
const { list, validate, redeem } = require('../controllers/couponsController');

const router = Router();

// Returns all active coupons in the current time window
router.get('/', list);

// Validates a coupon code against a cart
router.post('/validate', validate);

// Redeems a coupon code for an order (requires auth)
router.post('/redeem', auth, redeem);

module.exports = router;
