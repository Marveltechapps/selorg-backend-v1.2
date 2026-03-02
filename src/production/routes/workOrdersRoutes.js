const express = require('express');
const router = express.Router();
const {
  listWorkOrders,
  createWorkOrder,
  getWorkOrder,
  assignOperator,
  updateStatus,
} = require('../controllers/workOrdersController');

router.get('/', listWorkOrders);
router.post('/', createWorkOrder);
router.get('/:id', getWorkOrder);
router.post('/:id/assign', assignOperator);
router.patch('/:id/status', updateStatus);

module.exports = router;
