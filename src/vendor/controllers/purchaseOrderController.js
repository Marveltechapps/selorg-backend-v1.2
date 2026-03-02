const purchaseOrderService = require('../services/purchaseOrderService');
const { validationResult } = require('express-validator');

async function listPurchaseOrders(req, res, next) {
  try {
    const result = await purchaseOrderService.listPurchaseOrders(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createPurchaseOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 400, message: 'Validation error', details: errors.array() });
    const po = await purchaseOrderService.createPurchaseOrder(req.body, req.user && req.user.id);
    res.status(201).json(po);
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrder(req, res, next) {
  try {
    const po = await purchaseOrderService.getPurchaseOrderById(req.params.poId);
    res.json(po);
  } catch (err) {
    next(err);
  }
}

async function putPurchaseOrder(req, res, next) {
  try {
    const po = await purchaseOrderService.updatePurchaseOrder(req.params.poId, req.body);
    res.json(po);
  } catch (err) {
    next(err);
  }
}

async function postAction(req, res, next) {
  try {
    const po = await purchaseOrderService.performAction(req.params.poId, req.body);
    res.json(po);
  } catch (err) {
    next(err);
  }
}

async function bulkUpload(req, res, next) {
  try {
    // Accept file via multer in the route; for now create a job record
    const job = await purchaseOrderService.createBulkUploadJob({ filename: req.file && req.file.originalname });
    res.status(202).json(job);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPurchaseOrders,
  createPurchaseOrder,
  getPurchaseOrder,
  putPurchaseOrder,
  postAction,
  bulkUpload,
};

