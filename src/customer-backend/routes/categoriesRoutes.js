const { Router } = require('express');
const {
  listCategories,
  getCategoryDetail,
  getCategoryProductsBySlug,
  getSubcategoriesByCategorySlug,
} = require('../controllers/categoriesController');

const router = Router();
router.get('/', listCategories);
router.get('/:slug/products', getCategoryProductsBySlug);
router.get('/:slug/subcategories', getSubcategoriesByCategorySlug);
router.get('/:id', getCategoryDetail);
module.exports = router;
