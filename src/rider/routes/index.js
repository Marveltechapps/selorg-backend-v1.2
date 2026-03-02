const express = require('express');
const riderRoutes = require('./riderRoutes');
const fleetRoutes = require('./fleetRoutes');
const dispatchRoutes = require('./dispatchRoutes');
const hrRoutes = require('./hrRoutes');
const orderRoutes = require('./orderRoutes');
const overviewController = require('../controllers/overviewController');

const router = express.Router();

// Health endpoint for Applications management (no auth required)
router.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'rider', timestamp: new Date().toISOString() });
});

// Overview summary (before rider routes to avoid :riderId matching "summary")
router.get('/summary', overviewController.getSummary);

// Rider routes
router.use('/', riderRoutes);

// Fleet routes
router.use('/fleet', fleetRoutes);

// Dispatch routes
router.use('/dispatch', dispatchRoutes);

// HR routes (dashboard/summary, documents, riders, training, contracts, access)
router.use('/hr', hrRoutes);

// Orders (list, assign, alert) - rider dashboard
router.use('/orders', orderRoutes);

module.exports = router;
