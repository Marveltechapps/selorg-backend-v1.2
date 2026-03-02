const express = require('express');
const router = express.Router();
const qcController = require('../controllers/qcController');

router.get('/', qcController.listQCChecks);
router.post('/', qcController.createQCCheck);
router.get('/overview', qcController.overview);
router.get('/:qcId', qcController.getQCCheck);
router.patch('/:qcId', qcController.patchQCCheck);

module.exports = router;

