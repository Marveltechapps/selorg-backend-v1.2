const express = require('express');
const { scanBag, updateBag, getBag } = require('../controllers/bag.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.use(protect);
router.post('/scan', scanBag);
router.route('/:bagId').get(getBag).put(updateBag);
module.exports = router;
