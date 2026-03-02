const { Router } = require('express');
const auth = require('../middleware/auth');
const { list, getById, getDetails, createRequest } = require('../controllers/refundsController');

const router = Router();
router.get('/', auth, list);
router.post('/request', auth, createRequest);
router.get('/:id/details', auth, getDetails);
router.get('/:id', auth, getById);

module.exports = router;
