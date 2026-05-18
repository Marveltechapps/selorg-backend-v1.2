const express = require('express');
const { requirePermission } = require('../../core/middleware');
const { PERMISSIONS } = require('../../config/permissions');
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

router.get('/stats', requirePermission(PERMISSIONS.PRICING_READ), getPricingStatsHandler);

router.route('/references/categories')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getReferencesCategories);

router.route('/references/zones')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getReferencesZones);

router.route('/skus')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getPricingSKUs);

router.route('/skus/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateSKUPrice);

router.route('/surge-rules')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getSurgeRules)
  .post(requirePermission(PERMISSIONS.PRICING_OVERRIDE), createSurgeRule);

router.route('/surge-rules/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateSurgeRule)
  .delete(requirePermission(PERMISSIONS.PRICING_OVERRIDE), deleteSurgeRule);

router.route('/surge-config')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getSurgeConfig)
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateSurgeConfig);

router.route('/price-rules')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getPriceRules)
  .post(requirePermission(PERMISSIONS.PRICING_OVERRIDE), createPriceRule);

router.route('/discounts')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getDiscountCampaigns)
  .post(requirePermission(PERMISSIONS.PRICING_OVERRIDE), createDiscountCampaign);

router.route('/discounts/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateDiscountCampaign)
  .delete(requirePermission(PERMISSIONS.PRICING_OVERRIDE), deleteDiscountCampaign);

router.get('/coupons', requirePermission(PERMISSIONS.PRICING_READ), getCoupons);
router.post('/coupons', requirePermission(PERMISSIONS.PRICING_OVERRIDE), createCoupon);
router.post('/coupons/generate-code', requirePermission(PERMISSIONS.PRICING_OVERRIDE), generateCouponCode);
router.route('/coupons/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateCoupon)
  .delete(requirePermission(PERMISSIONS.PRICING_OVERRIDE), deleteCoupon);

router.route('/flash-sales')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getFlashSales)
  .post(requirePermission(PERMISSIONS.PRICING_OVERRIDE), createFlashSale);

router.route('/flash-sales/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateFlashSale)
  .delete(requirePermission(PERMISSIONS.PRICING_OVERRIDE), deleteFlashSale);

router.route('/bundles')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getBundles)
  .post(requirePermission(PERMISSIONS.PRICING_OVERRIDE), createBundle);

router.route('/bundles/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), updateBundle)
  .delete(requirePermission(PERMISSIONS.PRICING_OVERRIDE), deleteBundle);

router.route('/pending-updates')
  .get(requirePermission(PERMISSIONS.PRICING_READ), getPendingUpdates);

router.route('/pending-updates/:id')
  .put(requirePermission(PERMISSIONS.PRICING_OVERRIDE), handlePendingUpdate);

module.exports = router;
