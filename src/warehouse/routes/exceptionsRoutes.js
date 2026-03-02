const express = require('express');
const router = express.Router();
const exceptionsController = require('../controllers/exceptionsController');

router.get('/', exceptionsController.getExceptions);
router.post('/', exceptionsController.reportException);
router.get('/export', exceptionsController.exportExceptions);

router.get('/:id', exceptionsController.getExceptionDetails);
router.put('/:id/status', exceptionsController.updateStatus);
router.post('/:id/reject-shipment', exceptionsController.rejectShipment);
router.post('/:id/accept-partial', exceptionsController.acceptPartial);

module.exports = router;

