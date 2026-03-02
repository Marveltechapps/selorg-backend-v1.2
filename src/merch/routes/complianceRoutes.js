const express = require('express');
const {
  getSummary,
  getApprovals,
  updateApprovalStatus,
  getAudits,
  seedComplianceData
} = require('../controllers/complianceController');

const router = express.Router();

router.route('/summary')
  .get(getSummary);

router.route('/approvals')
  .get(getApprovals);

router.route('/approvals/:id')
  .put(updateApprovalStatus);

router.route('/audits')
  .get(getAudits);

router.route('/seed')
  .post(seedComplianceData);

module.exports = router;
