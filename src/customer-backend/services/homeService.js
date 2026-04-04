const mongoose = require('mongoose');
const { isHeroLaneSlot } = require('../utils/bannerPlacement');
const { HomeConfig } = require('../models/HomeConfig');
const { HomeSectionDefinition } = require('../models/HomeSectionDefinition');
const { Category } = require('../models/Category');
const { Banner } = require('../models/Banner');
const { HomeSection } = require('../models/HomeSection');
const { Product } = require('../models/Product');
const { enrichProductsWithVariants } = require('../utils/productVariantsPayload');
const { LifestyleItem } = require('../models/LifestyleItem');
const { PromoBlock } = require('../models/PromoBlock');
const { getDefaultAddress } = require('./addressService');
const { resolveCollectionProducts } = require('./merchandising/collectionService');
const { enrichHomePayloadLegacy } = require('../utils/customerMediaEnrichment');

async function resolveProducts(productIds = []) {
  if (!Array.isArray(productIds) || productIds.length === 0) return [];
  const products = await Product.find({
    _id: { $in: productIds },
    isActive: true,
    isSaleable: true,
    classification: 'Style',
  })
    .lean()
    .select({
      _id: 1,
      sku: 1,
      name: 1,
      size: 1,
      quantity: 1,
      tag: 1,
      price: 1,
      mrp: 1,
      originalPrice: 1,
      discount: 1,
      gstRate: 1,
      taxPercent: 1,
      imageUrl: 1,
      thumbnailUrl: 1,
      cardImageUrl: 1,
      isSaleable: 1,
      stock: 1,
      stockQuantity: 1,
      images: 1,
      hierarchyCode: 1,
      variants: 1,
    });
  const map = new Map(products.map((p) => [String(p._id), p]));
  const ordered = productIds.map((id) => map.get(String(id))).filter(Boolean);
  return enrichProductsWithVariants(ordered);
}

async function getHomePayload(req = {}) {
  let config = await HomeConfig.findOne({ key: 'main' }).lean();
  if (!config) {
    config = {
      key: 'main',
      searchPlaceholder: 'Search for products',
      deliveryTypeLabel: 'Delivery',
      categorySectionTitle: 'Shop by Category',
    };
  }
  let definitionsFromCollection = await HomeSectionDefinition.find().sort({ order: 1 }).lean();

  // If no sections are defined in the database, provide a default layout to avoid an empty home page.
  if (definitionsFromCollection.length === 0) {
    const banners = await Banner.find({ isActive: true }).select('_id slot').lean();
    const heroBanners = banners.filter((b) => b.slot === 'hero').map((b) => b._id);
    const midBanners = banners.filter((b) => b.slot === 'mid' || b.slot === 'banner_sub').map((b) => b._id);

    definitionsFromCollection = [
      { key: 'categories', label: 'Shop by Category', type: 'super_category', order: 1 },
    ];
    if (heroBanners.length > 0) {
      definitionsFromCollection.unshift({ key: 'hero_banner', label: 'Featured Offers', type: 'banner_main', order: 0, bannerIds: heroBanners });
    }
    if (midBanners.length > 0) {
      definitionsFromCollection.push({ key: 'mid_banner', label: 'Recommended for You', type: 'banner_sub', order: 2, bannerIds: midBanners });
    }
  }

  const sectionDefinitions = definitionsFromCollection.map((d) => ({ key: d.key, label: d.label || d.key }));
  const sectionOrder = sectionDefinitions.map((d) => d.key);

  const superCategoryDefs = definitionsFromCollection.filter((d) => d.type === 'super_category');
  const topLevelCategories = superCategoryDefs.length > 0
    ? await Category.find({ isActive: true, parentId: { $in: [null, undefined] } }).sort({ order: 1 }).lean()
    : [];
  const categoryByKey = {};
  for (const def of superCategoryDefs) {
    const ids = Array.isArray(def.categoryIds) && def.categoryIds.length > 0
      ? def.categoryIds.map((id) => (typeof id === 'object' && id && id._id ? id._id : id))
      : [];
    if (def.key) {
      if (ids.length > 0) {
        const found = await Category.find({ _id: { $in: ids }, isActive: true }).lean();
        const orderMap = new Map(ids.map((id, i) => [String(id), i]));
        categoryByKey[def.key] = found.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
      } else {
        // If super_category has no explicit categoryIds, fall back to all top-level categories.
        // This keeps the customer app fully driven by admin section definitions without dummy data.
        categoryByKey[def.key] = topLevelCategories;
      }
    }
  }
  const categories = categoryByKey[Object.keys(categoryByKey)[0]] || [];
  const now = new Date();
  const scheduleQuery = {
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
    ],
  };
  /** Ordered banner ObjectIds for this section (handles lean ObjectIds and populated { _id } refs). */
  function getBannerIdList(d) {
    if (Array.isArray(d.bannerIds) && d.bannerIds.length > 0) {
      return d.bannerIds
        .map((id) => {
          if (id == null) return null;
          if (typeof id === 'object' && id._id != null) return id._id;
          return id;
        })
        .filter((id) => id != null && mongoose.Types.ObjectId.isValid(String(id)));
    }
    if (d.bannerId) {
      const raw = typeof d.bannerId === 'object' && d.bannerId._id != null ? d.bannerId._id : d.bannerId;
      return raw && mongoose.Types.ObjectId.isValid(String(raw)) ? [raw] : [];
    }
    return [];
  }

  /** Unified "banner" sections: hero vs mid comes from Banner.slot (set in Banners tab). */
  const bannerUnified = definitionsFromCollection.filter((d) => d.type === 'banner' && getBannerIdList(d).length > 0);
  const unifiedFirstIds = [...new Set(bannerUnified.map((d) => String(getBannerIdList(d)[0])))];
  const unifiedSlotById = new Map();
  if (unifiedFirstIds.length > 0) {
    const oids = unifiedFirstIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const urows = await Banner.find({ _id: { $in: oids } }).select('slot').lean();
    for (const b of urows) {
      const slot = b && b.slot ? String(b.slot).toLowerCase() : 'mid';
      unifiedSlotById.set(String(b._id), slot);
    }
  }
  const bannerMainDefs = [
    ...definitionsFromCollection.filter((d) => d.type === 'banner_main' && getBannerIdList(d).length > 0),
    ...bannerUnified.filter((d) => {
      const id = String(getBannerIdList(d)[0]);
      return isHeroLaneSlot(unifiedSlotById.get(id));
    }),
  ];
  const bannerSubDefs = [
    ...definitionsFromCollection.filter((d) => d.type === 'banner_sub' && getBannerIdList(d).length > 0),
    ...bannerUnified.filter((d) => {
      const id = String(getBannerIdList(d)[0]);
      return !isHeroLaneSlot(unifiedSlotById.get(id));
    }),
  ];
  const heroBannerIds = [...new Set(bannerMainDefs.flatMap((d) => getBannerIdList(d)).map((id) => String(id)))];
  const midBannerIds = [...new Set(bannerSubDefs.flatMap((d) => getBannerIdList(d)).map((id) => String(id)))];
  let heroBanners = [];
  let midBanners = [];
  if (heroBannerIds.length > 0) {
    const heroOid = heroBannerIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    heroBanners = await Banner.find({ _id: { $in: heroOid }, isActive: true, ...scheduleQuery }).sort({ order: 1 }).lean();
    const orderMap = new Map(heroBannerIds.map((id, i) => [String(id), i]));
    heroBanners.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
  }
  if (midBannerIds.length > 0) {
    const midOid = midBannerIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    midBanners = await Banner.find({ _id: { $in: midOid }, isActive: true, ...scheduleQuery }).sort({ order: 1 }).lean();
    const orderMap = new Map(midBannerIds.map((id, i) => [String(id), i]));
    midBanners.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
  }
  /**
   * Section carousels: resolve by admin-selected IDs without schedule filter.
   * Do NOT filter by isActive here — inactive flags were dropping slides so the app showed
   * a single static banner (no dots) even when multiple IDs were configured.
   * Legacy hero/mid slot lists above still use isActive + schedule.
   */
  let mainBannerMap = new Map();
  if (heroBannerIds.length > 0) {
    const heroOid = heroBannerIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const rows = await Banner.find({ _id: { $in: heroOid } }).sort({ order: 1 }).lean();
    mainBannerMap = new Map(rows.map((b) => [String(b._id), b]));
  }
  let subBannerMap = new Map();
  if (midBannerIds.length > 0) {
    const midOid = midBannerIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const rows = await Banner.find({ _id: { $in: midOid } }).sort({ order: 1 }).lean();
    subBannerMap = new Map(rows.map((b) => [String(b._id), b]));
  }
  const bannersByKey = {};
  for (const d of bannerMainDefs) {
    const ids = getBannerIdList(d);
    if (d.key && ids.length > 0) {
      const list = ids.map((bid) => mainBannerMap.get(String(bid))).filter(Boolean);
      if (list.length > 0) bannersByKey[d.key] = list;
    }
  }
  for (const d of bannerSubDefs) {
    const ids = getBannerIdList(d);
    if (d.key && ids.length > 0) {
      const list = ids.map((bid) => subBannerMap.get(String(bid))).filter(Boolean);
      if (list.length > 0) bannersByKey[d.key] = list;
    }
  }
  const sectionsDocs = await HomeSection.find({ isActive: true }).sort({ order: 1 }).lean();
  const sectionDefs = await HomeSectionDefinition.find({ collectionId: { $ne: null } }).lean();
  const sections = {};
  for (const s of sectionsDocs) {
    const products = await resolveProducts(s.productIds || []);
    sections[s.sectionKey] = { title: s.title, products };
  }
  // HomeSectionDefinition with a collectionId is the source of truth for that key's products.
  // Always merge from the collection (do not skip when HomeSection already created an empty stub).
  for (const d of sectionDefs) {
    if (d.collectionId && d.key) {
      const products = await resolveCollectionProducts(d.collectionId);
      sections[d.key] = { title: d.label || d.key, products };
    }
  }
  const lifestyle = await LifestyleItem.find({ isActive: true }).sort({ order: 1 }).lean();
  const promoBlocksList = await PromoBlock.find({ isActive: true }).lean();
  const promoBlocks = {};
  for (const p of promoBlocksList) {
    promoBlocks[p.blockKey] = { imageUrl: p.imageUrl, link: p.link };
  }

  let defaultAddress = null;
  const userId = req?.user?._id;
  if (userId) {
    defaultAddress = await getDefaultAddress(userId);
  }

  const taglineDefs = definitionsFromCollection.filter((d) => d.type === 'tagline');
  const taglineByKey = {};
  for (const d of taglineDefs) {
    if (d.key && d.taglineText !== undefined) taglineByKey[d.key] = d.taglineText;
  }

  const typeByKey = {};
  for (const d of definitionsFromCollection) {
    if (d.key && d.type) {
      if (d.type === 'banner') {
        const ids = getBannerIdList(d);
        if (ids.length > 0) {
          const slot = unifiedSlotById.get(String(ids[0]));
          typeByKey[d.key] = isHeroLaneSlot(slot) ? 'banner_main' : 'banner_sub';
        } else {
          typeByKey[d.key] = 'banner_sub';
        }
      } else {
        typeByKey[d.key] = d.type;
      }
    }
  }

  const carouselByKey = {};
  /** Expose configured banner id lists so the app can reconcile if resolved bannersByKey is short. */
  const bannerIdsByKey = {};
  for (const d of definitionsFromCollection) {
    if (d.key && (d.type === 'banner_main' || d.type === 'banner_sub' || d.type === 'banner')) {
      const ids = getBannerIdList(d);
      /** Carousel when more than one banner; single banner = static (ignores stale DB useCarousel). */
      carouselByKey[d.key] = ids.length > 1;
      if (ids.length > 0) bannerIdsByKey[d.key] = ids.map((id) => String(id));
    }
  }

  // Section list (HomeSectionDefinition) is the ONLY source of truth. Never use HomeConfig.sectionOrder.
  const { sectionOrder: _cfgOrder, sectionDefinitions: _cfgDefs, ...configRest } = config || {};
  const configWithDefaults = config
    ? { ...configRest, sectionDefinitions, sectionOrder }
    : sectionDefinitions.length > 0
      ? { sectionDefinitions, sectionOrder }
      : null;

  return enrichHomePayloadLegacy({
    config: configWithDefaults,
    categories: categories || [],
    heroBanners: heroBanners || [],
    midBanners: midBanners || [],
    bannersByKey,
    bannerIdsByKey,
    taglineByKey,
    typeByKey,
    carouselByKey,
    categoryByKey,
    sections,
    lifestyle,
    promoBlocks,
    defaultAddress: defaultAddress || null,
  });
}

module.exports = { getHomePayload };
