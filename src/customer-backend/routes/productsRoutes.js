const { Router } = require('express');
const {
  getProductDetail,
  searchProducts,
  searchSuggestions,
  searchTrending,
} = require('../controllers/productsController');

const router = Router();
router.get('/search', searchProducts);
router.get('/search/suggestions', searchSuggestions);
router.get('/search/trending', searchTrending);
router.get('/:id', getProductDetail);
module.exports = router;
