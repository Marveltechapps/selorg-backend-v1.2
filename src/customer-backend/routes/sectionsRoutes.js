const { Router } = require('express');
const { getSectionProducts } = require('../controllers/sectionsController');

const router = Router();
router.get('/:key/products', getSectionProducts);

module.exports = router;
