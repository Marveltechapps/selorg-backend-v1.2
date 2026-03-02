const { Router } = require('express');
const { getProductDetail } = require('../controllers/productsController');

const router = Router();
router.get('/:id', getProductDetail);
module.exports = router;
