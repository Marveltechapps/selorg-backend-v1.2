const express = require('express');
const router = express.Router();
const storeWarehouseController = require('../controllers/storeWarehouseController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Stores (specific paths before :id)
router.get('/stores/performance', authenticateToken, cacheMiddleware(appConfig.cache.admin.stores), storeWarehouseController.getStorePerformance);
router.get('/stores/stats', authenticateToken, cacheMiddleware(appConfig.cache.admin.stores), storeWarehouseController.getStoreStats);
router.get('/stores', authenticateToken, cacheMiddleware(appConfig.cache.admin.stores), storeWarehouseController.listStores);
router.get('/stores/:id', authenticateToken, cacheMiddleware(appConfig.cache.admin.stores), storeWarehouseController.getStore);
router.post('/stores', authenticateToken, storeWarehouseController.createStore);
router.put('/stores/:id', authenticateToken, storeWarehouseController.updateStore);
router.delete('/stores/:id', authenticateToken, storeWarehouseController.deleteStore);

// Warehouses
router.get('/warehouses', authenticateToken, cacheMiddleware(appConfig.cache.admin.stores), storeWarehouseController.listWarehouses);
router.get('/warehouses/:id', authenticateToken, storeWarehouseController.getWarehouse);
router.post('/warehouses', authenticateToken, storeWarehouseController.createWarehouse);
router.put('/warehouses/:id', authenticateToken, storeWarehouseController.updateWarehouse);
router.delete('/warehouses/:id', authenticateToken, storeWarehouseController.deleteWarehouse);

// Staff
router.get('/staff', authenticateToken, cacheMiddleware(appConfig.cache.staff), storeWarehouseController.listStaff);
router.get('/staff/:id', authenticateToken, cacheMiddleware(appConfig.cache.staff), storeWarehouseController.getStaff);
router.post('/staff', authenticateToken, storeWarehouseController.createStaff);
router.put('/staff/:id', authenticateToken, storeWarehouseController.updateStaff);
router.delete('/staff/:id', authenticateToken, storeWarehouseController.deleteStaff);

module.exports = router;
