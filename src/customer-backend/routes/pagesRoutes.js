const { Router } = require('express');
const { getPage } = require('../controllers/pagesController');

const router = Router();
router.get('/:slug', getPage);
module.exports = router;
