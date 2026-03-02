const { HomeConfig, DEFAULT_SECTION_DEFINITIONS } = require('../models/HomeConfig');
const { HomeSectionDefinition } = require('../models/HomeSectionDefinition');
const { Category } = require('../models/Category');
const { Banner } = require('../models/Banner');
const { HomeSection } = require('../models/HomeSection');
const { Product } = require('../models/Product');
const { LifestyleItem } = require('../models/LifestyleItem');
const { PromoBlock } = require('../models/PromoBlock');
const { getDefaultAddress } = require('./addressService');

async function resolveProducts(productIds = []) {
  if (!Array.isArray(productIds) || productIds.length === 0) return [];
  const products = await Product.find({ _id: { $in: productIds }, isActive: true })
    .lean()
    .select('name images price originalPrice discount quantity');
  const map = new Map(products.map((p) => [String(p._id), p]));
  return productIds.map((id) => map.get(String(id))).filter(Boolean);
}

async function getHomePayload(req = {}) {
  const config = await HomeConfig.findOne({ key: 'main' }).lean();
  let categories;
  if (config && Array.isArray(config.categoryIds) && config.categoryIds.length > 0) {
    const ids = config.categoryIds.map((id) => (typeof id === 'object' && id && id._id ? id._id : id));
    const found = await Category.find({ _id: { $in: ids }, isActive: true }).lean();
    const orderMap = new Map(ids.map((id, i) => [String(id), i]));
    categories = found.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
  } else {
    categories = await Category.find({
      isActive: true,
      parentId: { $in: [null, undefined] },
    })
      .sort({ order: 1 })
      .lean();
  }
  const heroBanners = await Banner.find({ slot: 'hero', isActive: true }).sort({ order: 1 }).lean();
  const midBanners = await Banner.find({ slot: 'mid', isActive: true }).sort({ order: 1 }).lean();
  const sectionsDocs = await HomeSection.find({ isActive: true }).lean();
  const sections = {};
  for (const s of sectionsDocs) {
    const products = await resolveProducts(s.productIds || []);
    sections[s.sectionKey] = { title: s.title, products };
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

  const definitionsFromCollection = await HomeSectionDefinition.find().sort({ order: 1 }).lean();
  const sectionDefinitions =
    definitionsFromCollection.length > 0
      ? definitionsFromCollection.map((d) => ({ key: d.key, label: d.label || d.key }))
      : DEFAULT_SECTION_DEFINITIONS;
  const configWithDefaults = config ? { ...config, sectionDefinitions } : null;

  return {
    config: configWithDefaults,
    categories: categories || [],
    heroBanners: heroBanners || [],
    midBanners: midBanners || [],
    sections,
    lifestyle,
    promoBlocks,
    defaultAddress: defaultAddress || null,
  };
}

module.exports = { getHomePayload };
