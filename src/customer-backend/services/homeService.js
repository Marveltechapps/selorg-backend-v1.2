const { HomeConfig } = require('../models/HomeConfig');
const { HomeSectionDefinition } = require('../models/HomeSectionDefinition');
const { Category } = require('../models/Category');
const { Banner } = require('../models/Banner');
const { HomeSection } = require('../models/HomeSection');
const { Product } = require('../models/Product');
const { LifestyleItem } = require('../models/LifestyleItem');
const { PromoBlock } = require('../models/PromoBlock');
const { getDefaultAddress } = require('./addressService');
const { resolveCollectionProducts } = require('./merchandising/collectionService');

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
      tag: 1,
      price: 1,
      mrp: 1,
      taxPercent: 1,
      imageUrl: 1,
      isSaleable: 1,
      stock: 1,
      stockQuantity: 1,
      images: 1,
    });
  const map = new Map(products.map((p) => [String(p._id), p]));
  return productIds.map((id) => map.get(String(id))).filter(Boolean);
}

async function getHomePayload(req = {}) {
  const config = await HomeConfig.findOne({ key: 'main' }).lean();
  const definitionsFromCollection = await HomeSectionDefinition.find().sort({ order: 1 }).lean();
  const sectionDefinitions = definitionsFromCollection.map((d) => ({ key: d.key, label: d.label || d.key }));
  const sectionOrder = sectionDefinitions.map((d) => d.key);

  const superCategoryDefs = definitionsFromCollection.filter((d) => d.type === 'super_category');
  const categoryByKey = {};
  for (const def of superCategoryDefs) {
    const ids = Array.isArray(def.categoryIds) && def.categoryIds.length > 0
      ? def.categoryIds.map((id) => (typeof id === 'object' && id && id._id ? id._id : id))
      : [];
    if (ids.length > 0 && def.key) {
      const found = await Category.find({ _id: { $in: ids }, isActive: true }).lean();
      const orderMap = new Map(ids.map((id, i) => [String(id), i]));
      categoryByKey[def.key] = found.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
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
  const bannerMainDefs = definitionsFromCollection.filter((d) => d.type === 'banner_main' && d.bannerId);
  const bannerSubDefs = definitionsFromCollection.filter((d) => d.type === 'banner_sub' && d.bannerId);
  const heroBannerIds = bannerMainDefs.map((d) => d.bannerId).filter(Boolean);
  const midBannerIds = bannerSubDefs.map((d) => d.bannerId).filter(Boolean);
  let heroBanners = [];
  let midBanners = [];
  if (heroBannerIds.length > 0) {
    heroBanners = await Banner.find({ _id: { $in: heroBannerIds }, isActive: true, ...scheduleQuery }).sort({ order: 1 }).lean();
    const orderMap = new Map(heroBannerIds.map((id, i) => [String(id), i]));
    heroBanners.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
  }
  if (midBannerIds.length > 0) {
    midBanners = await Banner.find({ _id: { $in: midBannerIds }, isActive: true, ...scheduleQuery }).sort({ order: 1 }).lean();
    const orderMap = new Map(midBannerIds.map((id, i) => [String(id), i]));
    midBanners.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
  }
  const bannersByKey = {};
  for (const d of bannerMainDefs) {
    if (d.bannerId && d.key) {
      const banner = heroBanners.find((b) => String(b._id) === String(d.bannerId));
      if (banner) bannersByKey[d.key] = [banner];
    }
  }
  for (const d of bannerSubDefs) {
    if (d.bannerId && d.key) {
      const banner = midBanners.find((b) => String(b._id) === String(d.bannerId));
      if (banner) bannersByKey[d.key] = [banner];
    }
  }
  const sectionsDocs = await HomeSection.find({ isActive: true }).sort({ order: 1 }).lean();
  const sectionDefs = await HomeSectionDefinition.find({ collectionId: { $ne: null } }).lean();
  const sections = {};
  for (const s of sectionsDocs) {
    const products = await resolveProducts(s.productIds || []);
    sections[s.sectionKey] = { title: s.title, products };
  }
  for (const d of sectionDefs) {
    if (d.collectionId && !sections[d.key]) {
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
    if (d.key && d.type) typeByKey[d.key] = d.type;
  }

  // Section list (HomeSectionDefinition) is the ONLY source of truth. Never use HomeConfig.sectionOrder.
  const { sectionOrder: _cfgOrder, sectionDefinitions: _cfgDefs, ...configRest } = config || {};
  const configWithDefaults = config
    ? { ...configRest, sectionDefinitions, sectionOrder }
    : sectionDefinitions.length > 0
      ? { sectionDefinitions, sectionOrder }
      : null;

  return {
    config: configWithDefaults,
    categories: categories || [],
    heroBanners: heroBanners || [],
    midBanners: midBanners || [],
    bannersByKey,
    taglineByKey,
    typeByKey,
    categoryByKey,
    sections,
    lifestyle,
    promoBlocks,
    defaultAddress: defaultAddress || null,
  };
}

module.exports = { getHomePayload };
