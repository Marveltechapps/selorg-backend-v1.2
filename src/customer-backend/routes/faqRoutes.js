const { Router } = require('express');
const ctrl = require('../controllers/faqController');

const router = Router();
router.get('/', ctrl.list);

module.exports = router;
