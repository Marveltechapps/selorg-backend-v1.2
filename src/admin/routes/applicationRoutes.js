/**
 * Applications Management Routes
 * Mounted at /api/v1/admin/applications
 */
const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');

router.get('/', applicationController.list);
router.get('/:id/health', applicationController.getHealth);
router.post('/:id/test', applicationController.test);
router.put('/:id', applicationController.update);
router.patch('/:id', applicationController.toggle);

module.exports = router;
