const express = require('express');
const router = express.Router();
const { listFactories } = require('../controllers/overviewController');

router.get('/', listFactories);

module.exports = router;
