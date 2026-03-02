const express = require('express');
const router = express.Router();
const {
  getPicklists,
  createPicklist,
  getPicklistDetails,
  startPicking,
  updateProgress,
  pausePicking,
  completePicking,
  assignPicker,
  moveToPacking,
} = require('../controllers/picklistController');

router.get('/', getPicklists);
router.post('/', createPicklist);
router.get('/:picklistId', getPicklistDetails);
router.post('/:picklistId/start', startPicking);
router.post('/:picklistId/progress', updateProgress);
router.post('/:picklistId/pause', pausePicking);
router.post('/:picklistId/complete', completePicking);
router.post('/:picklistId/assign', assignPicker);
router.post('/:picklistId/move-to-packing', moveToPacking);

module.exports = router;

