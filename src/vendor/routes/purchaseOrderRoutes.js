const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const upload = multer({ dest: process.env.FILE_UPLOAD_DIR || 'uploads/' });
const router = express.Router();
const poController = require('../controllers/purchaseOrderController');
const { requireAuth } = require('../../core/middleware');

router.get('/', poController.listPurchaseOrders);
router.post('/', requireAuth, body('vendorId').notEmpty(), body('items').isArray(), poController.createPurchaseOrder);
router.post('/bulk-upload', requireAuth, upload.single('file'), poController.bulkUpload);

router.get('/:poId', poController.getPurchaseOrder);
router.put('/:poId', requireAuth, poController.putPurchaseOrder);
router.delete('/:poId', requireAuth, async (req, res) => {
  // soft delete
  try {
    const PurchaseOrder = require('../models/PurchaseOrder');
    const po = await PurchaseOrder.findById(req.params.poId);
    if (!po) return res.status(404).json({ code: 404, message: 'Not found' });
    po.archived = true;
    await po.save();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.post('/:poId/actions', requireAuth, poController.postAction);
router.get('/:poId/events', requireAuth, async (req, res) => {
  res.json([]); // placeholder for audit events
});

router.get('/overview', requireAuth, async (req, res) => {
  res.json({ totalPOs: 0, byStatus: {}, pendingApprovals: 0, totalValue: 0, trends: [] });
});

module.exports = router;

