/**
 * Picker Issue routes – POST /api/v1/picker/issues
 * Requires picker auth. Supports multipart for image upload.
 */
const express = require('express');
const multer = require('multer');
const issueController = require('../controllers/issue.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', requireAuth, multerUpload.single('image'), issueController.reportIssue);

module.exports = router;
