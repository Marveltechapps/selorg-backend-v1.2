/**
 * Verify routes – from frontend YAML (application-spec /verify/face).
 * Accepts multipart/form-data (field "face") or application/json ({ image: base64 }).
 */
const express = require('express');
const multer = require('multer');
const verifyController = require('../controllers/verify.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
const multerMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function optionalMulterFace(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return multerMemory.single('face')(req, res, next);
  }
  next();
}

router.post('/face', optionalMulterFace, requireAuth, verifyController.face);

module.exports = router;
