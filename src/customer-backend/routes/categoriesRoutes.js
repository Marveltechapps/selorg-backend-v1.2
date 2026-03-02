const { Router } = require('express');
const { listCategories, getCategoryDetail } = require('../controllers/categoriesController');

const router = Router();
router.get('/', listCategories);
router.get('/:id', getCategoryDetail);
module.exports = router;
