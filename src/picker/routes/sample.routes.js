/**
 * Sample routes
 */
const express = require('express');
const router = express.Router();
const sampleController = require('../controllers/sample.controller');

router.get('/', sampleController.getAll);
router.get('/:id', sampleController.getById);
router.post('/', sampleController.create);

module.exports = router;
