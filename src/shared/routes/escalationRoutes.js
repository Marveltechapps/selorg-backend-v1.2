const { Router } = require('express');
const { Escalation } = require('../../common-models/Escalation');
const { authenticateToken } = require('../../core/middleware/auth.middleware');

const router = Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const escalation = await Escalation.create({
      ...req.body,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: escalation });
  } catch (err) {
    console.error('escalation create error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/by-team/:team', authenticateToken, async (req, res) => {
  try {
    const { team } = req.params;
    const status = req.query.status || undefined;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = { targetTeam: team };
    if (status) filter.status = status;

    if (team === 'darkstore' && req.query.storeId) {
      filter.storeId = req.query.storeId;
    }
    if (team === 'rider_ops' && req.query.riderId) {
      filter.riderId = req.query.riderId;
    }

    const [escalations, total] = await Promise.all([
      Escalation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Escalation.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      data: escalations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('escalation by-team error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const escalation = await Escalation.findById(req.params.id).lean();
    if (!escalation) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: escalation });
  } catch (err) {
    console.error('escalation getById error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.patch('/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const escalation = await Escalation.findByIdAndUpdate(
      req.params.id,
      {
        status: 'resolved',
        resolutionNotes: req.body.resolutionNotes || '',
        resolvedAt: new Date(),
        resolvedBy: req.user._id,
      },
      { new: true }
    );
    if (!escalation) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: escalation });
  } catch (err) {
    console.error('escalation resolve error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.patch('/:id/assign', authenticateToken, async (req, res) => {
  try {
    const escalation = await Escalation.findByIdAndUpdate(
      req.params.id,
      {
        status: 'in_progress',
        assignedTo: req.body.assignedTo,
        assignedStoreName: req.body.assignedStoreName,
      },
      { new: true }
    );
    if (!escalation) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: escalation });
  } catch (err) {
    console.error('escalation assign error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
