const WorkOrder = require('../models/WorkOrder');
const productionToWarehouseService = require('../../shared/services/productionToWarehouseService');
const logger = require('../../core/utils/logger');

const VALID_STATUSES = ['pending', 'in-progress', 'completed', 'on-hold'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

function getStoreId(req) {
  return (
    req.query?.storeId ||
    req.query?.factoryId ||
    req.body?.storeId ||
    req.body?.factoryId ||
    process.env.DEFAULT_STORE_ID ||
    process.env.DASHBOARD_HUB_KEY ||
    'chennai-hub'
  );
}

function toWorkOrderDto(o) {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    product: o.product,
    quantity: o.quantity,
    line: o.line || '',
    operator: o.operator,
    priority: o.priority,
    status: o.status,
    dueDate: o.dueDate ? new Date(o.dueDate).toISOString().split('T')[0] : '',
  };
}

function syncCompletionToWarehouse(order, storeId, userId) {
  productionToWarehouseService
    .onProductionRunComplete(order, {
      storeId,
      user: userId || 'system',
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

const listWorkOrders = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const search = req.query.search || '';
    const query = search
      ? {
          store_id: storeId,
          $or: [
            { orderNumber: { $regex: search, $options: 'i' } },
            { product: { $regex: search, $options: 'i' } },
          ],
        }
      : { store_id: storeId };
    const orders = await WorkOrder.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json(orders.map(toWorkOrderDto));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch work orders' });
  }
};

const createWorkOrder = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { product, quantity, line, priority, dueDate, status, operator } = req.body || {};
    if (!product || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'product and quantity are required' });
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, error: 'invalid priority' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid status' });
    }
    const orderNumber = `WO-${Math.floor(1000 + Math.random() * 9000)}`;
    const doc = await WorkOrder.create({
      store_id: storeId,
      orderNumber,
      product: String(product).trim(),
      quantity: qty,
      line: line ? String(line).trim() : '',
      operator: operator ? String(operator).trim() : undefined,
      priority: priority || 'medium',
      status: status || 'pending',
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    res.status(201).json(toWorkOrderDto(doc.toObject()));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create work order' });
  }
};

const assignOperator = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const { operator } = req.body || {};
    const order = await WorkOrder.findOne({ _id: id, store_id: storeId });
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
    const storeId = getStoreId(req);
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be pending, in-progress, completed, or on-hold' });
    }
    const order = await WorkOrder.findOne({ _id: id, store_id: storeId });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    const wasCompleted = order.status === 'completed';
    order.status = status;
    await order.save();

    if (status === 'completed' && !wasCompleted) {
      syncCompletionToWarehouse(order, storeId, req.userId);
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
    const storeId = getStoreId(req);
    const { id } = req.params;
    const order = await WorkOrder.findOne({ _id: id, store_id: storeId }).lean();
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    res.status(200).json(toWorkOrderDto(order));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch work order' });
  }
};

const updateWorkOrder = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const { product, quantity, line, priority, dueDate, status, operator } = req.body || {};

    const order = await WorkOrder.findOne({ _id: id, store_id: storeId });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }

    const wasCompleted = order.status === 'completed';

    if (product !== undefined) {
      if (!String(product).trim()) {
        return res.status(400).json({ success: false, error: 'product cannot be empty' });
      }
      order.product = String(product).trim();
    }
    if (quantity !== undefined) {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
      }
      order.quantity = qty;
    }
    if (line !== undefined) {
      order.line = line ? String(line).trim() : '';
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ success: false, error: 'invalid priority' });
      }
      order.priority = priority;
    }
    if (dueDate !== undefined) {
      order.dueDate = dueDate ? new Date(dueDate) : undefined;
    }
    if (operator !== undefined) {
      order.operator = operator ? String(operator).trim() : undefined;
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: 'invalid status' });
      }
      order.status = status;
    }

    await order.save();

    if (order.status === 'completed' && !wasCompleted) {
      syncCompletionToWarehouse(order, storeId, req.userId);
    }

    res.status(200).json(toWorkOrderDto(order.toObject()));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update work order' });
  }
};

const deleteWorkOrder = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;

    const order = await WorkOrder.findOne({ _id: id, store_id: storeId });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }

    await WorkOrder.deleteOne({ _id: id, store_id: storeId });
    res.status(200).json({ success: true, message: 'Work order deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete work order' });
  }
};

module.exports = {
  listWorkOrders,
  createWorkOrder,
  getWorkOrder,
  assignOperator,
  updateStatus,
  updateWorkOrder,
  deleteWorkOrder,
};
