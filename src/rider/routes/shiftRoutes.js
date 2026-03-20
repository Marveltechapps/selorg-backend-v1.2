const express = require('express');
const shiftController = require('../controllers/shiftController');

const router = express.Router();

// Specific rider routes must come BEFORE the generic :id route
router.get('/available/list', shiftController.getAvailable);
router.get('/my', shiftController.myShifts);
router.post('/select', shiftController.select);
router.post('/start', shiftController.start);
router.post('/end', shiftController.end);

// Admin/dashboard CRUD (can be wrapped with auth middleware at mount site if needed)
router.get('/', shiftController.list);
router.post('/', shiftController.create);
router.get('/:id', shiftController.getById);
router.put('/:id', shiftController.update);
router.delete('/:id', shiftController.remove);

module.exports = router;

