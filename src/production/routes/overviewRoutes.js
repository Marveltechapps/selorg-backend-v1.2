const express = require('express');
const router = express.Router();
const {
  getOverview,
  startBatch,
  updateLine,
} = require('../controllers/overviewController');

router.get('/', getOverview);
router.post('/batch', startBatch);
router.patch('/lines/:lineId', updateLine);

module.exports = router;
