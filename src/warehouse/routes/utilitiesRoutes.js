const express = require('express');
const router = express.Router();
const utilitiesController = require('../controllers/utilitiesController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/zones', utilitiesController.getZones);
router.post('/upload-skus', upload.single('file'), utilitiesController.uploadSKUs);
router.get('/logs', utilitiesController.getLogs);
router.post('/generate-labels', utilitiesController.generateLabels);
router.post('/bin-reassignment', utilitiesController.reassignBins);
router.post('/reassign-bins', utilitiesController.reassignBins);
router.post('/print-barcodes', utilitiesController.printBarcodes);

module.exports = router;

