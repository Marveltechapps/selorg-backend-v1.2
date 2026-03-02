const express = require('express');
const router = express.Router();
const fleetController = require('../controllers/fleetController');

// Fleet Summary Endpoints
router.get('/summary', fleetController.getFleetSummary);

// Vehicle Management Endpoints
router.get('/vehicles', fleetController.listVehicles);
router.post('/vehicles', fleetController.createVehicle);
router.get('/vehicles/:id', fleetController.getVehicleById);
router.put('/vehicles/:id', fleetController.updateVehicle);

// Maintenance Endpoints
router.get('/maintenance', fleetController.listMaintenanceTasks);
router.post('/maintenance', fleetController.createMaintenanceTask);
router.get('/maintenance/:id', fleetController.getMaintenanceTaskById);
router.put('/maintenance/:id', fleetController.updateMaintenanceTask);

module.exports = router;

