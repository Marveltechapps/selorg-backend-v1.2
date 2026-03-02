const { listActive, validateCode, applyCode } = require('../services/couponsService');

async function list(req, res) {
  try {
    const data = await listActive();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('coupons list error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function validate(req, res) {
  try {
    const { code, orderAmount } = req.body || {};
    const orderAmountNum = typeof orderAmount === 'number' ? orderAmount : parseFloat(orderAmount) || 0;
    const result = await validateCode(code, orderAmountNum);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('coupons validate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function apply(req, res) {
  try {
    const userId = req.user?._id;
    const { code, orderAmount } = req.body || {};
    const orderAmountNum = typeof orderAmount === 'number' ? orderAmount : parseFloat(orderAmount) || 0;
    const result = await applyCode(userId, code, orderAmountNum);
    if (!result.success) {
      res.status(400).json({ success: false, message: result.message, data: { discount: 0 } });
      return;
    }
    res.status(200).json({ success: true, data: result.appliedCoupon, message: result.message });
  } catch (err) {
    console.error('coupons apply error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { list, validate, apply };
