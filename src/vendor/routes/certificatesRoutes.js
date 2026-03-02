const express = require('express');
const multer = require('multer');
const upload = multer({ dest: process.env.FILE_UPLOAD_DIR || 'uploads/' });
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { requireAuth } = require('../../core/middleware');

// vendor-scoped certificates
router.get('/vendors/:vendorId/certificates', certificateController.listVendorCertificates);
router.post('/vendors/:vendorId/certificates', requireAuth, upload.single('file'), certificateController.createVendorCertificate);

// top-level certificate operations
router.get('/certificates/:certificateId', certificateController.getCertificate);
router.delete('/certificates/:certificateId', requireAuth, certificateController.deleteCertificate);

module.exports = router;

