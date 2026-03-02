const express = require('express');
const router = express.Router();
const masterDataController = require('../controllers/masterDataController');
const { authenticateToken } = require('../../core/middleware');

// Cities
router.get('/cities', authenticateToken, masterDataController.listCities);
router.get('/cities/:id', authenticateToken, masterDataController.getCity);
router.post('/cities', authenticateToken, masterDataController.createCity);
router.put('/cities/:id', authenticateToken, masterDataController.updateCity);
router.delete('/cities/:id', authenticateToken, masterDataController.deleteCity);

// Zones
router.get('/zones', authenticateToken, masterDataController.listZones);
router.get('/zones/:id', authenticateToken, masterDataController.getZone);
router.post('/zones', authenticateToken, masterDataController.createZone);
router.put('/zones/:id', authenticateToken, masterDataController.updateZone);
router.delete('/zones/:id', authenticateToken, masterDataController.deleteZone);

// Managers: handled by userRoutes at GET /users/managers (must be before /:id)

// Vehicle Types
router.get('/vehicle-types', authenticateToken, masterDataController.listVehicleTypes);
router.get('/vehicle-types/:id', authenticateToken, masterDataController.getVehicleType);
router.post('/vehicle-types', authenticateToken, masterDataController.createVehicleType);
router.put('/vehicle-types/:id', authenticateToken, masterDataController.updateVehicleType);
router.delete('/vehicle-types/:id', authenticateToken, masterDataController.deleteVehicleType);

// SKU Units
router.get('/sku-units', authenticateToken, masterDataController.listSkuUnits);
router.get('/sku-units/:id', authenticateToken, masterDataController.getSkuUnit);
router.post('/sku-units', authenticateToken, masterDataController.createSkuUnit);
router.put('/sku-units/:id', authenticateToken, masterDataController.updateSkuUnit);
router.delete('/sku-units/:id', authenticateToken, masterDataController.deleteSkuUnit);

module.exports = router;
