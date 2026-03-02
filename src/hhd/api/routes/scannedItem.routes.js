const express = require('express');
const {
  createScannedItem,
  getScannedItems,
  getScannedItem,
} = require('../controllers/scannedItem.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.use(protect);
router.route('/').get(getScannedItems).post(createScannedItem);
router.get('/:id', getScannedItem);
module.exports = router;
