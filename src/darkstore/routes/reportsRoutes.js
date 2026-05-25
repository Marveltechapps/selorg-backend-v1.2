const express = require('express');
const router = express.Router();
const {
  getInventoryReport,
  getStaffReport,
  getComplianceReport,
  exportReports,
} = require('../controllers/reportsController');

router.get('/inventory', getInventoryReport);
router.get('/staff', getStaffReport);
router.get('/compliance', getComplianceReport);
router.get('/export', exportReports);

module.exports = router;
