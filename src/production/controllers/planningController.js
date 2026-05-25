const ProductionPlan = require('../models/ProductionPlan');

const PLAN_STATUSES = ['scheduled', 'in-progress', 'completed'];

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

function toPlanDto(p) {
  return {
    id: p._id.toString(),
    product: p.product,
    line: p.line,
    startDate: p.startDate ? new Date(p.startDate).toISOString().split('T')[0] : '',
    endDate: p.endDate ? new Date(p.endDate).toISOString().split('T')[0] : '',
    quantity: p.quantity,
    status: p.status,
  };
}

const listPlans = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const plans = await ProductionPlan.find({ store_id: storeId }).sort({ startDate: 1 }).lean();
    res.status(200).json(plans.map(toPlanDto));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch plans' });
  }
};

const createPlan = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { product, line, startDate, endDate, quantity, status } = req.body || {};
    if (!product || !line || !startDate || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'product, line, startDate, and quantity are required' });
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
    }
    if (status && !PLAN_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${PLAN_STATUSES.join(', ')}`,
      });
    }
    const end = endDate || startDate;
    const doc = await ProductionPlan.create({
      store_id: storeId,
      product: String(product).trim(),
      line: String(line).trim(),
      startDate: new Date(startDate),
      endDate: new Date(end),
      quantity: qty,
      status: status || 'scheduled',
    });
    res.status(201).json(toPlanDto(doc.toObject()));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create plan' });
  }
};

const updatePlan = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const { product, line, startDate, endDate, quantity, status } = req.body || {};

    const plan = await ProductionPlan.findOne({ _id: id, store_id: storeId });
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    if (product !== undefined) {
      if (!String(product).trim()) {
        return res.status(400).json({ success: false, error: 'product cannot be empty' });
      }
      plan.product = String(product).trim();
    }
    if (line !== undefined) {
      if (!String(line).trim()) {
        return res.status(400).json({ success: false, error: 'line cannot be empty' });
      }
      plan.line = String(line).trim();
    }
    if (startDate !== undefined) {
      plan.startDate = new Date(startDate);
    }
    if (endDate !== undefined) {
      plan.endDate = new Date(endDate);
    } else if (startDate !== undefined && !endDate) {
      plan.endDate = plan.startDate;
    }
    if (quantity !== undefined) {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
      }
      plan.quantity = qty;
    }
    if (status !== undefined) {
      if (!PLAN_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `status must be one of: ${PLAN_STATUSES.join(', ')}`,
        });
      }
      plan.status = status;
    }

    await plan.save();
    res.status(200).json(toPlanDto(plan.toObject()));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update plan' });
  }
};

const deletePlan = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;

    const plan = await ProductionPlan.findOne({ _id: id, store_id: storeId });
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    await ProductionPlan.deleteOne({ _id: id, store_id: storeId });
    res.status(200).json({ success: true, message: 'Plan deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete plan' });
  }
};

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
