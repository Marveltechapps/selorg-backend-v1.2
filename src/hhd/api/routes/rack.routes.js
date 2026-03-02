const express = require('express');
const { scanRack, getRack, getAvailableRacks } = require('../controllers/rack.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.use(protect);
router.post('/scan', scanRack);
router.get('/available', getAvailableRacks);
router.get('/:rackCode', getRack);
module.exports = router;
