const express = require('express');
const router = express.Router();
const { listPlans, createPlan } = require('../controllers/planningController');

router.get('/', listPlans);
router.post('/', createPlan);

module.exports = router;
