/**
 * Pick & Pack Ops routes
 * GET /api/v1/darkstore/pick-ops
 */
const express = require('express');
const router = express.Router();
const { getPickOps } = require('../controllers/pickOpsController');

router.get('/', getPickOps);

module.exports = router;
