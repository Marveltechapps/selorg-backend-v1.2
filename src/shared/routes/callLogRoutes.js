const { Router } = require('express');
const { CallLog } = require('../../common-models/CallLog');
const { authenticateToken } = require('../../core/middleware/auth.middleware');

const router = Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const callLog = await CallLog.create(req.body);
    res.status(201).json({ success: true, data: callLog });
  } catch (err) {
    console.error('callLog create error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/by-order/:orderId', authenticateToken, async (req, res) => {
  try {
    const logs = await CallLog.find({ orderId: req.params.orderId })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    console.error('callLog by-order error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/by-ticket/:ticketId', authenticateToken, async (req, res) => {
  try {
    const logs = await CallLog.find({ ticketId: req.params.ticketId })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    console.error('callLog by-ticket error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/by-customer/:customerId', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const [logs, total] = await Promise.all([
      CallLog.find({ customerId: req.params.customerId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CallLog.countDocuments({ customerId: req.params.customerId }),
    ]);
    res.status(200).json({
      success: true,
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('callLog by-customer error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
