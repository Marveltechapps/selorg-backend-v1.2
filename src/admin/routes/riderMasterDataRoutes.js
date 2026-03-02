const express = require('express');
const router = express.Router();
const riderMasterDataController = require('../controllers/riderMasterDataController');
const { authenticateToken } = require('../../core/middleware');

router.get('/riders', authenticateToken, riderMasterDataController.listRiders);
router.get('/riders/:id', authenticateToken, riderMasterDataController.getRider);
router.patch('/riders/:id', authenticateToken, riderMasterDataController.updateRiderStatus);

module.exports = router;
