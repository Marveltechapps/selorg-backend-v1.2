const express = require('express');
const riderRoutes = require('./riderRoutes');
const fleetRoutes = require('./fleetRoutes');
const dispatchRoutes = require('./dispatchRoutes');
const hrRoutes = require('./hrRoutes');
const orderRoutes = require('./orderRoutes');
const kitRoutes = require('./kitRoutes');
const shiftRoutes = require('./shiftRoutes');
const overviewController = require('../controllers/overviewController');

const router = express.Router();

// Health endpoint for Applications management (no auth required)
router.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'rider', timestamp: new Date().toISOString() });
});

// Overview summary (keep before other routes)
router.get('/summary', overviewController.getSummary);

// Mount sub-routers with fixed prefixes BEFORE the catch-all rider routes.
// This avoids paths like "/orders" or "/fleet" being treated as a ":riderId" parameter.

// Shift master & roster for riders
router.use('/shifts', shiftRoutes);

// Fleet routes
router.use('/fleet', fleetRoutes);

// Dispatch routes
router.use('/dispatch', dispatchRoutes);

// HR routes (dashboard/summary, documents, riders, training, contracts, access)
router.use('/hr', hrRoutes);

// Kit & Training config
router.use('/kit', kitRoutes);

// Orders (list, assign, alert) - rider dashboard
router.use('/orders', orderRoutes);

// Rider routes ("/", "/:riderId", etc.) mounted last so they don't shadow
// more specific prefixes like /fleet, /dispatch, /hr, /orders.
router.use('/', riderRoutes);

module.exports = router;
