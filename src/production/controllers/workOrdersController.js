const WorkOrder = require('../models/WorkOrder');
const productionToWarehouseService = require('../../shared/services/productionToWarehouseService');
const logger = require('../../core/utils/logger');

const listWorkOrders = async (req, res) => {
  try {
    const search = req.query.search || '';
    const query = search
      ? { $or: [{ orderNumber: { $regex: search, $options: 'i' } }, { product: { $regex: search, $options: 'i' } }] }
      : {};
    const orders = await WorkOrder.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json(
      orders.map((o) => ({
        id: o._id.toString(),
        orderNumber: o.orderNumber,
        product: o.product,
        quantity: o.quantity,
        line: o.line || '',
        operator: o.operator,
        priority: o.priority,
        status: o.status,
        dueDate: o.dueDate ? new Date(o.dueDate).toISOString().split('T')[0] : '',
      }))
    );
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch work orders' });
  }
};

const createWorkOrder = async (req, res) => {
  try {
    const { product, quantity, line, priority, dueDate } = req.body || {};
    if (!product || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'product and quantity are required' });
    }
    const orderNumber = `WO-${Math.floor(1000 + Math.random() * 9000)}`;
    const doc = await WorkOrder.create({
      orderNumber,
      product,
      quantity: Number(quantity),
      line: line || '',
      priority: priority || 'medium',
      status: 'pending',
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    res.status(201).json({
      id: doc._id.toString(),
      orderNumber: doc.orderNumber,
      product: doc.product,
      quantity: doc.quantity,
      line: doc.line,
      priority: doc.priority,
      status: doc.status,
      dueDate: doc.dueDate ? doc.dueDate.toISOString().split('T')[0] : '',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create work order' });
  }
};

const assignOperator = async (req, res) => {
  try {
    const { id } = req.params;
    const { operator } = req.body || {};
    const order = await WorkOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    order.operator = operator || '';
    order.status = 'in-progress';
    await order.save();
    res.status(200).json({
      id: order._id.toString(),
      operator: order.operator,
      status: order.status,
      message: 'Operator assigned',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to assign operator' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const validStatuses = ['pending', 'in-progress', 'completed', 'on-hold'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be pending, in-progress, completed, or on-hold' });
    }
    const order = await WorkOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    const wasCompleted = order.status === 'completed';
    order.status = status;
    await order.save();

    // Production → Warehouse integration: when work order completes, add finished goods to warehouse inventory
    if (status === 'completed' && !wasCompleted) {
      const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;
      productionToWarehouseService
        .onProductionRunComplete(order, {
          storeId,
          user: req.userId || 'system',
        })
        .then((result) => {
          if (result.success) {
            logger.info('Production to warehouse: work order completion synced', {
              workOrderId: order._id,
              workOrderNumber: order.orderNumber,
              adjustments: result.adjustments,
            });
          } else if (result.errors?.length) {
            logger.warn('Production to warehouse: sync had issues', {
              workOrderId: order._id,
              workOrderNumber: order.orderNumber,
              errors: result.errors,
            });
          }
        })
        .catch((err) => {
          logger.error('Production to warehouse: sync failed', {
            workOrderId: order._id,
            workOrderNumber: order.orderNumber,
            error: err.message,
          });
        });
    }

    res.status(200).json({
      id: order._id.toString(),
      status: order.status,
      message: 'Status updated',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update status' });
  }
};

const getWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await WorkOrder.findById(id).lean();
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    res.status(200).json({
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      product: order.product,
      quantity: order.quantity,
      line: order.line || '',
      operator: order.operator,
      priority: order.priority,
      status: order.status,
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString().split('T')[0] : '',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch work order' });
  }
};

module.exports = {
  listWorkOrders,
  createWorkOrder,
  getWorkOrder,
  assignOperator,
  updateStatus,
};
