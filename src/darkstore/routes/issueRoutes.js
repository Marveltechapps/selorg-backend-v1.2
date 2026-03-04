/**
 * Darkstore Issue routes – picker issues management
 * RBAC: darkstore, admin, super_admin
 */
const express = require('express');
const issueController = require('../controllers/issueController');

const router = express.Router();

router.get('/ops-users', issueController.getOpsUsers);
router.get('/', issueController.listIssues);
router.get('/:id', issueController.getIssueById);
router.patch('/:id', issueController.updateIssue);

module.exports = router;
