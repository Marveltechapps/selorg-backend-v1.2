const express = require('express');
const { uploadPhoto, getPhoto, verifyPhoto } = require('../controllers/photo.controller');
const { protect } = require('../../middleware/auth');
const { upload } = require('../../services/fileUpload.service');

const router = express.Router();
router.use(protect);
router.post('/', upload.single('photo'), uploadPhoto);
router.get('/order/:orderId/bag/:bagId', getPhoto);
router.put('/:photoId/verify', verifyPhoto);
module.exports = router;
