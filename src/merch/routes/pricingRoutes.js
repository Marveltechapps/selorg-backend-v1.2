const express = require('express');
const {
  getPricingSKUs,
  updateSKUPrice,
  getSurgeRules,
  createSurgeRule,
  updateSurgeRule,
  deleteSurgeRule,
  getSurgeConfig,
  updateSurgeConfig,
  getPendingUpdates,
  handlePendingUpdate,
  getPriceRules,
  createPriceRule,
  getPricingStatsHandler,
  getDiscountCampaigns,
  createDiscountCampaign,
  updateDiscountCampaign,
  deleteDiscountCampaign,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  generateCouponCode,
  getFlashSales,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
  getBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  getReferencesCategories,
  getReferencesZones,
} = require('../controllers/pricingController');

const router = express.Router();

router.get('/stats', getPricingStatsHandler);

router.route('/references/categories')
  .get(getReferencesCategories);

router.route('/references/zones')
  .get(getReferencesZones);

router.route('/skus')
  .get(getPricingSKUs);

router.route('/skus/:id')
  .put(updateSKUPrice);

router.route('/surge-rules')
  .get(getSurgeRules)
  .post(createSurgeRule);

router.route('/surge-rules/:id')
  .put(updateSurgeRule)
  .delete(deleteSurgeRule);

router.route('/surge-config')
  .get(getSurgeConfig)
  .put(updateSurgeConfig);

router.route('/price-rules')
  .get(getPriceRules)
  .post(createPriceRule);

router.route('/discounts')
  .get(getDiscountCampaigns)
  .post(createDiscountCampaign);

router.route('/discounts/:id')
  .put(updateDiscountCampaign)
  .delete(deleteDiscountCampaign);

router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.post('/coupons/generate-code', generateCouponCode);
router.route('/coupons/:id')
  .put(updateCoupon)
  .delete(deleteCoupon);

router.route('/flash-sales')
  .get(getFlashSales)
  .post(createFlashSale);

router.route('/flash-sales/:id')
  .put(updateFlashSale)
  .delete(deleteFlashSale);

router.route('/bundles')
  .get(getBundles)
  .post(createBundle);

router.route('/bundles/:id')
  .put(updateBundle)
  .delete(deleteBundle);

router.route('/pending-updates')
  .get(getPendingUpdates);

router.route('/pending-updates/:id')
  .put(handlePendingUpdate);

module.exports = router;
