const refundsService = require('../services/refundsService');

async function list(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
    const result = await refundsService.listRefunds(String(userId), page, pageSize);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('refunds list error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const refund = await refundsService.getRefundById(String(userId), req.params.id);
    if (!refund) {
      res.status(404).json({ success: false, message: 'Refund not found' });
      return;
    }
    res.status(200).json({ success: true, data: refund });
  } catch (err) {
    console.error('refunds getById error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getDetails(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const details = await refundsService.getRefundDetailsForCustomer(String(userId), req.params.id);
    if (!details) {
      res.status(404).json({ success: false, message: 'Refund not found' });
      return;
    }
    res.status(200).json({ success: true, data: details });
  } catch (err) {
    console.error('refunds getDetails error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function createRequest(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const refund = await refundsService.createRefundRequest(String(userId), req.body);
    res.status(201).json({ success: true, data: refund });
  } catch (err) {
    console.error('refunds createRequest error:', err);
    const status = err.message && (err.message.includes('not found') || err.message.includes('already exists')) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message || 'Internal server error' });
  }
}

module.exports = {
  list,
  getById,
  getDetails,
  createRequest,
};
