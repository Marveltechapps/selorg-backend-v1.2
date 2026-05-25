const express = require('express');
const router = express.Router();
const {
  getOverview,
  startBatch,
  updateLine,
  createLine,
  updateLineDetails,
  deleteLine,
} = require('../controllers/overviewController');

router.get('/', getOverview);
router.post('/batch', startBatch);
router.post('/lines', createLine);
router.put('/lines/:lineId', updateLineDetails);
router.delete('/lines/:lineId', deleteLine);
router.patch('/lines/:lineId', updateLine);

module.exports = router;
