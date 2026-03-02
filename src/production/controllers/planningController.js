const ProductionPlan = require('../models/ProductionPlan');

const listPlans = async (req, res) => {
  try {
    const plans = await ProductionPlan.find({}).sort({ startDate: 1 }).lean();
    res.status(200).json(plans.map((p) => ({
      id: p._id.toString(),
      product: p.product,
      line: p.line,
      startDate: p.startDate ? new Date(p.startDate).toISOString().split('T')[0] : '',
      endDate: p.endDate ? new Date(p.endDate).toISOString().split('T')[0] : '',
      quantity: p.quantity,
      status: p.status,
    })));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch plans' });
  }
};

const createPlan = async (req, res) => {
  try {
    const { product, line, startDate, endDate, quantity } = req.body || {};
    if (!product || !line || !startDate || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'product, line, startDate, and quantity are required' });
    }
    const end = endDate || startDate;
    const doc = await ProductionPlan.create({
      product,
      line,
      startDate: new Date(startDate),
      endDate: new Date(end),
      quantity: Number(quantity),
      status: 'scheduled',
    });
    res.status(201).json({
      id: doc._id.toString(),
      product: doc.product,
      line: doc.line,
      startDate: doc.startDate ? doc.startDate.toISOString().split('T')[0] : '',
      endDate: doc.endDate ? doc.endDate.toISOString().split('T')[0] : '',
      quantity: doc.quantity,
      status: doc.status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create plan' });
  }
};

module.exports = { listPlans, createPlan };
