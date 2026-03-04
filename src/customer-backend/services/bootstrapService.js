const { getHomePayload } = require('./homeService');
const { getHomePagePayload, buildHomePageFromLegacy } = require('./cms/pageService');
const { FeatureFlag } = require('../models/FeatureFlag');
const { FlowConfig } = require('../models/FlowConfig');
const { PromotionRule } = require('../models/PromotionRule');
const { getDefaultAddress } = require('./addressService');

const now = new Date();

function isPromotionActive(rule) {
  if (!rule || !rule.isActive) return false;
  if (rule.schedule) {
    if (rule.schedule.startDate && rule.schedule.startDate > now) return false;
    if (rule.schedule.endDate && rule.schedule.endDate < now) return false;
  }
  if (rule.usageLimit != null && rule.usageCount >= rule.usageLimit) return false;
  return true;
}

/**
 * Get v2 bootstrap payload.
 * If Page with slug 'home' exists and is published, use block-based payload.
 * Otherwise fall back to legacy home payload structure for backward compatibility.
 */
async function getBootstrapPayload(req = {}) {
  const siteId = req?.query?.siteId || req?.headers?.['x-site-id'] || null;

  const homePage = await getHomePagePayload(siteId);

  const featureFlagsList = await FeatureFlag.find({ isActive: true }).lean();
  const featureFlags = {};
  for (const f of featureFlagsList) {
    featureFlags[f.key] = f.value;
  }

  const flowConfigList = await FlowConfig.find().lean();
  const flowConfig = {};
  for (const f of flowConfigList) {
    flowConfig[f.key] = f.value;
  }

  const promoRules = await PromotionRule.find({ isActive: true }).lean();
  const activePromotions = promoRules.filter(isPromotionActive).map((r) => ({
    id: String(r._id),
    name: r.name,
    type: r.type,
    targetType: r.targetType,
    targetId: r.targetId ? String(r.targetId) : null,
    discountValue: r.discountValue,
    minCartValue: r.minCartValue,
    maxDiscountCap: r.maxDiscountCap,
    autoApply: r.autoApply,
    couponCode: r.couponCode,
  }));

  let defaultAddress = null;
  const userId = req?.user?._id;
  if (userId) {
    defaultAddress = await getDefaultAddress(userId);
  }

  if (homePage) {
    return {
      pages: {
        home: homePage,
      },
      featureFlags,
      flowConfig,
      activePromotions,
      defaultAddress,
    };
  }

  const legacy = await getHomePayload(req);
  const homeFromLegacy = buildHomePageFromLegacy(legacy);
  return {
    pages: {
      home: homeFromLegacy,
    },
    legacy: legacy,
    featureFlags,
    flowConfig,
    activePromotions,
    defaultAddress,
  };
}

module.exports = { getBootstrapPayload };
