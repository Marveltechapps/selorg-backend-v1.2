const { Router } = require('express');
const {
  searchProducts,
  searchSuggestions,
  searchTrending,
} = require('../controllers/productsController');

const router = Router();
router.get('/', searchProducts);
router.get('/suggestions', searchSuggestions);
router.get('/trending', searchTrending);

module.exports = router;
