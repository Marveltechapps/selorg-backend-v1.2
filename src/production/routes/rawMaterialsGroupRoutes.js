const express = require('express');
const router = express.Router();
const {
  listMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  orderMaterial,
  listReceipts,
  markReceived,
  listRequisitions,
  createRequisition,
  updateRequisitionStatus,
} = require('../controllers/rawMaterialsGroupController');

router.get('/materials', listMaterials);
router.post('/materials', createMaterial);
router.put('/materials/:id', updateMaterial);
router.delete('/materials/:id', deleteMaterial);
router.post('/materials/:id/order', orderMaterial);

router.get('/receipts', listReceipts);
router.post('/receipts/:id/receive', markReceived);

router.get('/requisitions', listRequisitions);
router.post('/requisitions', createRequisition);
router.patch('/requisitions/:id/status', updateRequisitionStatus);

module.exports = router;
