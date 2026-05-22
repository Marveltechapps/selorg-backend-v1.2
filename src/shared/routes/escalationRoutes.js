const { Router } = require('express');
const mongoose = require('mongoose');
const { Escalation } = require('../../common-models/Escalation');
const Rider = require('../../rider/models/Rider');
const { authenticateToken } = require('../../core/middleware/auth.middleware');
const {
  enrichEscalations,
  enrichEscalationById,
} = require('../services/escalationEnrichmentService');

const router = Router();

const ALLOWED_UPDATE_FIELDS = [
  'status',
  'resolutionNotes',
  'riderId',
  'assignedTo',
  'assignedStoreName',
  'priority',
  'description',
  'orderDisplayId',
  'riderName',
];

router.post('/', authenticateToken, async (req, res) => {
  try {
    const escalation = await Escalation.create({
      ...req.body,
      createdBy: req.user._id,
    });
    const enriched = await enrichEscalationById(escalation.toObject ? escalation.toObject() : escalation);
    res.status(201).json({ success: true, data: enriched });
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const filter = { targetTeam: team };
    if (status && status !== 'all') filter.status = status;

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

    const enriched = await enrichEscalations(escalations);

    res.status(200).json({
      success: true,
      data: enriched,
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
    const enriched = await enrichEscalationById(escalation);
    res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    console.error('escalation getById error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.patch('/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const nextStatus =
      req.body.status === 'closed' ? 'closed' : 'resolved';
    const escalation = await Escalation.findByIdAndUpdate(
      req.params.id,
      {
        status: nextStatus,
        resolutionNotes: req.body.resolutionNotes || '',
        resolvedAt: new Date(),
        resolvedBy: req.user._id,
      },
      { new: true }
    ).lean();
    if (!escalation) return res.status(404).json({ success: false, message: 'Not found' });
    const enriched = await enrichEscalationById(escalation);
    res.status(200).json({ success: true, data: enriched });
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
    ).lean();
    if (!escalation) return res.status(404).json({ success: false, message: 'Not found' });
    const enriched = await enrichEscalationById(escalation);
    res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    console.error('escalation assign error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const updates = {};
    ALLOWED_UPDATE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (req.body.riderId !== undefined) {
      const rawRider = String(req.body.riderId).trim();
      if (/^RIDER-/i.test(rawRider)) {
        const rider = await Rider.findOne({ id: rawRider.toUpperCase() }).select('_id name').lean();
        if (rider) {
          updates.riderId = rider._id;
          updates.riderName = rider.name;
        } else {
          return res.status(400).json({ success: false, message: `Rider not found: ${rawRider}` });
        }
      } else if (mongoose.Types.ObjectId.isValid(rawRider)) {
        updates.riderId = new mongoose.Types.ObjectId(rawRider);
        const rider = await Rider.findById(updates.riderId).select('name').lean();
        if (rider?.name) updates.riderName = rider.name;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    if (updates.status === 'resolved' || updates.status === 'closed') {
      updates.resolvedAt = new Date();
      updates.resolvedBy = req.user._id;
    }

    const escalation = await Escalation.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).lean();

    if (!escalation) return res.status(404).json({ success: false, message: 'Not found' });
    const enriched = await enrichEscalationById(escalation);
    res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    console.error('escalation patch error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
