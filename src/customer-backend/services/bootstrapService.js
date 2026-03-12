const { getHomePayload } = require('./homeService');
const { getHomePagePayload, buildHomePageFromLegacy } = require('./cms/pageService');
const { FeatureFlag } = require('../models/FeatureFlag');
const { FlowConfig } = require('../models/FlowConfig');
const { PromotionRule } = require('../models/PromotionRule');
const { getDefaultAddress } = require('./addressService');
const { HomeConfig } = require('../models/HomeConfig');

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

  const homeConfigDoc = await HomeConfig.findOne({ key: 'main' }).lean();
  const homeConfig = homeConfigDoc
    ? {
        searchPlaceholder: homeConfigDoc.searchPlaceholder,
        heroVideoUrl: homeConfigDoc.heroVideoUrl,
        categorySectionTitle: homeConfigDoc.categorySectionTitle,
        organicTagline: homeConfigDoc.organicTagline,
        organicIconUrl: homeConfigDoc.organicIconUrl,
        deliveryTypeLabel: homeConfigDoc.deliveryTypeLabel,
      }
    : null;

  if (homePage) {
    return {
      pages: {
        home: homePage,
      },
      homeConfig,
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
    homeConfig,
    featureFlags,
    flowConfig,
    activePromotions,
    defaultAddress,
  };
}

/** Block type to legacy section key mapping */
const BLOCK_TYPE_TO_SECTION = {
  categoryGrid: 'categories',
  heroBanner: 'hero_banner',
  bannerCarousel: 'mid_banner',
  productCarousel: 'deals',
  collectionCarousel: 'deals',
  lifestyleGrid: 'lifestyle',
  promoImage: 'greens_banner',
  organicTagline: 'organic_tagline',
};

const PRODUCT_SECTION_KEYS = ['deals', 'wellbeing', 'new_deals', 'fresh_juice', 'deals_2'];

/**
 * Transform block-based home page to legacy CustomerHomePayload for admin preview.
 */
function blocksToLegacyPayload(homePage, homeConfig) {
  const rawBlocks = homePage?.blocks || [];
  const blocks = Array.isArray(rawBlocks)
    ? rawBlocks
    : (rawBlocks && typeof rawBlocks === 'object' && rawBlocks.blocks) ? rawBlocks.blocks : [];
  const config = homeConfig ? {
    ...homeConfig,
    key: 'main',
    sectionOrder: [],
    sectionDefinitions: [],
    sectionVisibility: {},
    categoryIds: [],
  } : null;

  function humanize(key) {
    return (key || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  let categories = [];
  let heroBanners = [];
  let midBanners = [];
  const sections = {};
  let lifestyle = [];
  const promoBlocks = {};
  let productSectionIndex = 0;

  for (const block of blocks) {
    const type = block.type;
    const data = block.data || {};
    const blockConfig = block.config || {};
    const sectionKey = BLOCK_TYPE_TO_SECTION[type];

    if (sectionKey) config?.sectionOrder?.push(sectionKey);

    if (type === 'categoryGrid') {
      categories = data.categories || [];
    } else if (type === 'heroBanner') {
      heroBanners = data.banners || [];
    } else if (type === 'bannerCarousel') {
      midBanners = data.banners || [];
    } else if (type === 'productCarousel' || type === 'collectionCarousel') {
      const sk = PRODUCT_SECTION_KEYS[productSectionIndex] || `deals_${productSectionIndex}`;
      sections[sk] = { title: blockConfig.title || sk, products: data.products || [] };
      productSectionIndex += 1;
    } else if (type === 'lifestyleGrid') {
      lifestyle = data.items || [];
    } else if (type === 'promoImage') {
      Object.assign(promoBlocks, data.promoBlocks || {});
    } else if (type === 'organicTagline') {
      if (config) {
        config.organicTagline = blockConfig.tagline || config.organicTagline;
        config.organicIconUrl = blockConfig.iconUrl || config.organicIconUrl;
      }
    }
  }

  if (config && config.sectionOrder?.length) {
    config.sectionDefinitions = config.sectionOrder.map((k) => ({ key: k, label: humanize(k) }));
    config.sectionVisibility = config.sectionOrder.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {});
  }

  return {
    config,
    categories,
    heroBanners,
    midBanners,
    sections,
    lifestyle,
    promoBlocks,
    defaultAddress: null,
  };
}

/**
 * Get bootstrap payload transformed to legacy format for admin preview.
 */
async function getBootstrapPreviewForAdmin(req = {}) {
  const bootstrap = await getBootstrapPayload(req);
  if (bootstrap.legacy) {
    return bootstrap.legacy;
  }
  return blocksToLegacyPayload(bootstrap.pages?.home, bootstrap.homeConfig);
}

module.exports = { getBootstrapPayload, getBootstrapPreviewForAdmin };
