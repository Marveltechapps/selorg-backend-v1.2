const express = require('express');
const {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getMerchStats,
  getStockConflicts,
  getPromoUplift,
  createStockConflict,
  createPromoUplift,
  getPriceChanges,
  createPriceChange
} = require('../controllers/merchController');

const router = express.Router();

// Overview routes
router.get('/overview/stats', getMerchStats);

router.route('/overview/conflicts')
  .get(getStockConflicts)
  .post(createStockConflict);

router.route('/overview/uplift')
  .get(getPromoUplift)
  .post(createPromoUplift);

router.route('/overview/price-changes')
  .get(getPriceChanges)
  .post(createPriceChange);

// Campaign routes
router
  .route('/campaigns')
  .get(getCampaigns)
  .post(createCampaign);

router
  .route('/campaigns/:id')
  .get(getCampaign)
  .put(updateCampaign)
  .delete(deleteCampaign);

module.exports = router;
