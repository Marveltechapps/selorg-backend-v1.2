const express = require('express');
const router = express.Router();
const { listPlans, createPlan, updatePlan, deletePlan } = require('../controllers/planningController');

router.get('/', listPlans);
router.post('/', createPlan);
router.put('/:id', updatePlan);
router.delete('/:id', deletePlan);

module.exports = router;
