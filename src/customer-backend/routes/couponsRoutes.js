const { Router } = require('express');
const auth = require('../middleware/auth');
const { list, validate, apply } = require('../controllers/couponsController');

const router = Router();
router.get('/', list);
router.post('/validate', validate);
router.post('/apply', auth, apply);

module.exports = router;
