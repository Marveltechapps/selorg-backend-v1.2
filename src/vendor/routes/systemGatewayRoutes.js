const express = require('express');
const router = express.Router();
const systemGatewayController = require('../controllers/systemGatewayController');
const { authenticateToken } = require('../../core/middleware/auth.middleware');
const asyncHandler = require('../../middleware/asyncHandler');

// All routes require authentication
router.use(authenticateToken);

// Services
router.get('/services', asyncHandler(systemGatewayController.getServices));
router.get('/services/:id', asyncHandler(systemGatewayController.getServiceById));
router.post('/services', asyncHandler(systemGatewayController.upsertService));
router.put('/services/:id', asyncHandler(systemGatewayController.upsertService));

// Logs
router.get('/logs', asyncHandler(systemGatewayController.getLogs));
router.post('/logs', asyncHandler(systemGatewayController.createLog));

module.exports = router;
