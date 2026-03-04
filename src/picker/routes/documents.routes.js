/**
 * Documents routes – from frontend YAML (application-spec /documents/upload, /documents).
 * Phase 1 RBAC: Dashboard endpoints for document verify/reject will require Admin or Warehouse role.
 */
const express = require('express');
const multer = require('multer');
const documentsController = require('../controllers/documents.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
const multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload', requireAuth, multerUpload.single('file'), documentsController.upload);
router.get('/', requireAuth, documentsController.list);

module.exports = router;
