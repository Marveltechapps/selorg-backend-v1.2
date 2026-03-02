const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const vendorController = require('../controllers/vendorController2');
const { requireAuth } = require('../../core/middleware');

router.get('/', vendorController.listVendors);
router.post(
  '/',
  body('name').notEmpty(),
  body('code').notEmpty(),
  vendorController.createVendor
);

router.get('/summary', vendorController.listVendors); // reuse list for summary quick counts

router.get('/:vendorId', vendorController.getVendor);
router.put('/:vendorId', vendorController.putVendor);
router.patch('/:vendorId', vendorController.patchVendor);
router.post('/:vendorId/actions', requireAuth, vendorController.postAction);
// vendor-scoped nested endpoints from OpenAPI
router.get('/:vendorId/purchase-orders', vendorController.listVendorPurchaseOrders);
router.get('/:vendorId/qc-checks', vendorController.listVendorQCChecks);
router.post('/:vendorId/qc-checks', vendorController.createVendorQCCheck);
router.get('/:vendorId/alerts', vendorController.listVendorAlerts);
router.post('/:vendorId/alerts', requireAuth, vendorController.createVendorAlert);
router.get('/:vendorId/performance', vendorController.getVendorPerformance);
router.get('/:vendorId/health', vendorController.getVendorHealth);

module.exports = router;

