const express = require('express');
const router = express.Router();
const {
  getAlerts,
  getAlertById,
  performAlertAction,
  clearResolvedAlerts,
} = require('../controllers/alertController');

// GET /api/darkstore/alerts
router.get('/', getAlerts);

// DELETE /api/darkstore/alerts/resolved (must be before /:alertId to avoid route conflict)
router.delete('/resolved', clearResolvedAlerts);

// GET /api/darkstore/alerts/debug/ids - Debug endpoint to list all alert IDs (must be before /:alertId)
router.get('/debug/ids', async (req, res) => {
  try {
    const Alert = require('../models/Alert');
    const alerts = await Alert.find({}).select('alert_id title status').limit(10).lean();
    res.status(200).json({
      success: true,
      count: alerts.length,
      alerts: alerts.map(a => ({
        id: a.alert_id,
        title: a.title,
        status: a.status
      })),
      message: alerts.length === 0 ? 'No alerts found. Run: node scripts/seed-alerts.js' : 'Use these IDs in Postman'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/darkstore/alerts/:alertId
router.get('/:alertId', getAlertById);

// POST /api/darkstore/alerts/:alertId/action
router.post('/:alertId/action', performAlertAction);

module.exports = router;

