/**
 * Picker app device routes – /devices
 * Requires picker auth.
 * POST /return: accepts JSON (deviceId, condition?, conditionPhotoUrl?) or multipart with conditionPhoto.
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const devicesController = require('../controllers/devices.controller');

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/assigned', requireAuth, devicesController.getAssignedDevice);
router.post('/upload-condition-photo', requireAuth, multerUpload.single('file'), devicesController.uploadConditionPhoto);
router.post('/return', requireAuth, multerUpload.single('conditionPhoto'), devicesController.returnDevice);

module.exports = router;
