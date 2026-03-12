const { Page } = require('../../models/Page');
const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');
const { Product } = require('../../models/Product');
const { LifestyleItem } = require('../../models/LifestyleItem');
const { PromoBlock } = require('../../models/PromoBlock');
const { HomeConfig } = require('../../models/HomeConfig');
const { HomeSection } = require('../../models/HomeSection');
const { resolveCollectionProducts } = require('../merchandising/collectionService');

const now = new Date();

function isWithinSchedule(schedule) {
  if (!schedule) return true;
  if (schedule.startDate && schedule.startDate > now) return false;
  if (schedule.endDate && schedule.endDate < now) return false;
  return true;
}

function filterBannersBySchedule(banners) {
  return (banners || []).filter((b) => {
    if (b.startDate && b.startDate > now) return false;
    if (b.endDate && b.endDate < now) return false;
    return true;
  });
}

function applyMaxItems(arr, maxItems) {
  if (!Array.isArray(arr)) return arr;
  if (maxItems == null || typeof maxItems !== 'number' || maxItems <= 0) return arr;
  return arr.slice(0, maxItems);
}

async function resolveBlockData(block, siteId = null) {
  const data = {};
  const type = block.type;
  const config = block.config || {};
  const maxItems = config.maxItems;

  if (type === 'heroBanner' || type === 'bannerCarousel') {
    const slot = type === 'heroBanner' ? 'hero' : 'mid';
    let query = { slot, isActive: true };
    if (siteId) query.siteId = siteId;
    const banners = await Banner.find(query).sort({ order: 1 }).lean();
    data.banners = applyMaxItems(filterBannersBySchedule(banners), maxItems ?? (type === 'heroBanner' ? 5 : 5));
  } else if (type === 'categoryGrid') {
    const categoryIds = block.dataSource?.categoryIds;
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const cats = await Category.find({ _id: { $in: categoryIds }, isActive: true }).lean();
      const orderMap = new Map(categoryIds.map((id, i) => [String(id), i]));
      data.categories = cats.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
    } else {
      const config = await HomeConfig.findOne({ key: 'main' }).lean();
      const ids = config?.categoryIds || [];
      const idArr = ids.map((id) => (typeof id === 'object' && id?._id ? id._id : id)).filter(Boolean);
      if (idArr.length > 0) {
        const cats = await Category.find({ _id: { $in: idArr }, isActive: true }).lean();
        const orderMap = new Map(idArr.map((id, i) => [String(id), i]));
        data.categories = cats.sort((a, b) => (orderMap.get(String(a._id)) ?? 99) - (orderMap.get(String(b._id)) ?? 99));
      } else {
        data.categories = await Category.find({ isActive: true, parentId: { $in: [null, undefined] } })
          .sort({ order: 1 })
          .lean();
      }
    }
    data.categories = applyMaxItems(data.categories, maxItems ?? 6);
  } else if (type === 'productCarousel' || type === 'collectionCarousel') {
    const collId = block.dataSource?.collectionId;
    if (collId) {
      const products = await resolveCollectionProducts(collId);
      data.products = applyMaxItems(products, maxItems ?? 8);
    } else {
      data.products = [];
    }
  } else if (type === 'lifestyleGrid') {
    const items = await LifestyleItem.find({ isActive: true }).sort({ order: 1 }).lean();
    data.items = applyMaxItems(items, maxItems ?? 5).map((i) => ({
      ...i,
      redirectType: i.redirectType || null,
      redirectValue: i.redirectValue || null,
    }));
  } else if (type === 'promoImage') {
    const promoBlocks = await PromoBlock.find({ isActive: true }).lean();
    data.promoBlocks = {};
    for (const p of promoBlocks) {
      data.promoBlocks[p.blockKey] = {
        imageUrl: p.imageUrl,
        link: p.link,
        redirectType: p.redirectType || null,
        redirectValue: p.redirectValue || null,
      };
    }
  }

  return data;
}

/**
 * Get page payload by slug with resolved block data
 */
async function getPageBySlug(slug, siteId = null) {
  let query = { slug, status: 'published' };
  if (siteId) query.siteId = siteId;
  const page = await Page.findOne(query).lean();
  if (!page) return null;

  const blocks = [];
  const sorted = (page.blocks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const block of sorted) {
    if (!isWithinSchedule(block.schedule)) continue;
    const data = await resolveBlockData(block, siteId || page.siteId);
    blocks.push({
      id: String(block._id),
      type: block.type,
      config: block.config || {},
      data,
    });
  }

  return {
    pageId: String(page._id),
    slug: page.slug,
    title: page.title,
    version: page.version || 1,
    blocks,
  };
}

/**
 * Build home page from CMS Page model, or null if no published home page
 */
async function getHomePagePayload(siteId = null) {
  return getPageBySlug('home', siteId);
}

/** Map legacy section keys to block types */
const SECTION_TO_BLOCK_TYPE = {
  categories: 'categoryGrid',
  hero_banner: 'heroBanner',
  deals: 'productCarousel',
  deals_2: 'productCarousel',
  wellbeing: 'productCarousel',
  new_deals: 'productCarousel',
  fresh_juice: 'productCarousel',
  greens_banner: 'promoImage',
  section_image: 'promoImage',
  lifestyle: 'lifestyleGrid',
  mid_banner: 'bannerCarousel',
  organic_tagline: 'organicTagline',
};

/**
 * Build block-based home page from legacy home payload.
 * Used when no published CMS Page exists (e.g. customer_pages not seeded).
 */
function buildHomePageFromLegacy(legacy) {
  if (!legacy) return null;
  const config = legacy.config || {};
  const sectionOrder = config.sectionOrder || [
    'categories', 'hero_banner', 'deals', 'wellbeing', 'greens_banner', 'section_image',
    'lifestyle', 'new_deals', 'mid_banner', 'fresh_juice', 'deals_2', 'organic_tagline',
  ];
  const sections = legacy.sections || {};

  const blocks = [];
  let order = 0;
  for (const sk of sectionOrder) {
    const blockType = SECTION_TO_BLOCK_TYPE[sk] || 'promoImage';
    const section = sections[sk];
    const blockConfig = {};
    if (section?.title) blockConfig.title = section.title;
    if (config.categorySectionTitle && sk === 'categories') blockConfig.title = config.categorySectionTitle;
    if (config.organicTagline && sk === 'organic_tagline') blockConfig.tagline = config.organicTagline;
    if (config.organicIconUrl && sk === 'organic_tagline') blockConfig.iconUrl = config.organicIconUrl;

    let data = {};
    if (sk === 'categories') data = { categories: legacy.categories || [] };
    else if (sk === 'hero_banner') data = { banners: legacy.heroBanners || [] };
    else if (sk === 'mid_banner') data = { banners: legacy.midBanners || [] };
    else if (['deals', 'deals_2', 'wellbeing', 'new_deals', 'fresh_juice'].includes(sk))
      data = { products: section?.products || [] };
    else if (sk === 'lifestyle') data = { items: legacy.lifestyle || [] };
    else if (sk === 'greens_banner' || sk === 'section_image') data = { promoBlocks: legacy.promoBlocks || {} };
    else if (sk === 'organic_tagline') data = {};

    blocks.push({
      id: `legacy-${sk}-${order}`,
      type: blockType,
      config: blockConfig,
      data,
    });
    order += 1;
  }

  return {
    pageId: 'legacy-home',
    slug: 'home',
    title: 'Home',
    version: 1,
    blocks,
  };
}

module.exports = { getPageBySlug, getHomePagePayload, resolveBlockData, buildHomePageFromLegacy };
