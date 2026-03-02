/**
 * Applications Management Routes
 * Mounted at /api/v1/admin/applications
 */
const express = require('express');
const router = express.Router();
const applicationsController = require('../controllers/applicationsController');

router.get('/', applicationsController.list);
router.get('/:id/health', applicationsController.getHealth);
router.put('/:id', applicationsController.update);
router.patch('/:id', applicationsController.toggle);
router.post('/:id/test-connection', applicationsController.testConnection);

module.exports = router;
