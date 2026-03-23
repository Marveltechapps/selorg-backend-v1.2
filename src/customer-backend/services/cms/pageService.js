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

/** Map section definition type to block type (for auto-generated keys like section_xxx) */
const SECTION_TYPE_TO_BLOCK = {
  super_category: 'categoryGrid',
  lifestyle: 'lifestyleGrid',
  banner_main: 'heroBanner',
  banner_sub: 'bannerCarousel',
  collections: 'collectionCarousel',
  tagline: 'organicTagline',
};

function getBlockTypeForSectionKey(sk, typeByKey = {}) {
  const defType = typeByKey[sk];
  if (defType && SECTION_TYPE_TO_BLOCK[defType]) return SECTION_TYPE_TO_BLOCK[defType];
  if (SECTION_TO_BLOCK_TYPE[sk]) return SECTION_TO_BLOCK_TYPE[sk];
  if (/^banner_main_/.test(sk)) return 'heroBanner';
  if (/^banner_sub_/.test(sk)) return 'bannerCarousel';
  if (/^collections_/.test(sk) || /^deals_/.test(sk) || /^wellbeing_/.test(sk)) return 'collectionCarousel';
  return 'promoImage';
}

/** Parse section key from block id `legacy-<sectionKey>-<order>` */
function sectionKeyFromLegacyBlockId(blockId) {
  const m = String(blockId || '').match(/^legacy-(.+)-(\d+)$/);
  return m ? m[1] : '';
}

/**
 * Consecutive dashboard banner sections (multiple Banner (Main) rows) each produce one block with
 * often a single banner — the app then shows a vertical stack instead of one carousel.
 * Merge those into one block with a combined `banners` array (same for Sub / mid).
 * Does not merge legacy `hero_banner` with `banner_main_*` (different slots).
 */
function mergeConsecutiveBannerBlocks(blocks, typeByKey = {}) {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;

  /** Keys like `banner_<mongoId>` (section type Banner); not `banner_main_*` / `banner_sub_*`. */
  const isUnifiedBannerKey = (sk) =>
    typeof sk === 'string' &&
    /^banner_/.test(sk) &&
    !/^banner_main_/.test(sk) &&
    !/^banner_sub_/.test(sk);

  function canMergePair(last, cur, lastSk, curSk) {
    if (last.type === 'heroBanner' && cur.type === 'heroBanner') {
      const bothLegacyHero = lastSk === 'hero_banner' && curSk === 'hero_banner';
      const bothMainDefs = /^banner_main_/.test(lastSk) && /^banner_main_/.test(curSk);
      const bothUnified =
        isUnifiedBannerKey(lastSk) &&
        isUnifiedBannerKey(curSk) &&
        typeByKey[lastSk] === 'banner_main' &&
        typeByKey[curSk] === 'banner_main';
      return bothLegacyHero || bothMainDefs || bothUnified;
    }
    if (last.type === 'bannerCarousel' && cur.type === 'bannerCarousel') {
      const bothLegacyMid = lastSk === 'mid_banner' && curSk === 'mid_banner';
      const bothSubDefs = /^banner_sub_/.test(lastSk) && /^banner_sub_/.test(curSk);
      const bothUnified =
        isUnifiedBannerKey(lastSk) &&
        isUnifiedBannerKey(curSk) &&
        typeByKey[lastSk] === 'banner_sub' &&
        typeByKey[curSk] === 'banner_sub';
      return bothLegacyMid || bothSubDefs || bothUnified;
    }
    return false;
  }

  const out = [];
  for (const block of blocks) {
    const curSk = sectionKeyFromLegacyBlockId(block.id);
    const last = out[out.length - 1];
    const lastSk = last ? sectionKeyFromLegacyBlockId(last.id) : '';

    if (last && canMergePair(last, block, lastSk, curSk)) {
      const a = Array.isArray(last.data?.banners) ? last.data.banners : [];
      const b = Array.isArray(block.data?.banners) ? block.data.banners : [];
      last.data = { ...last.data, banners: [...a, ...b] };
      const n = last.data.banners.length;
      last.config = { ...last.config, carousel: n > 1 };
      continue;
    }

    out.push({
      ...block,
      data: block.data ? { ...block.data } : {},
      config: block.config ? { ...block.config } : {},
    });
  }
  return out;
}

/**
 * Build block-based home page from legacy home payload.
 * Used when no published CMS Page exists (e.g. customer_pages not seeded).
 */
function buildHomePageFromLegacy(legacy) {
  if (!legacy) return null;
  const config = legacy.config || {};
  const sectionOrder = Array.isArray(config.sectionOrder) ? config.sectionOrder : [];
  const sections = legacy.sections || {};
  const bannersByKey = legacy.bannersByKey || {};
  const taglineByKey = legacy.taglineByKey || {};
  const typeByKey = legacy.typeByKey || {};
  const carouselByKey = legacy.carouselByKey || {};
  const categoryByKey = legacy.categoryByKey || {};

  const blocks = [];
  let order = 0;
  for (const sk of sectionOrder) {
    let blockType = getBlockTypeForSectionKey(sk, typeByKey);
    if (taglineByKey[sk] !== undefined) blockType = 'organicTagline';
    const section = sections[sk];
    const blockConfig = {};
    // Always use dashboard-provided label for the block title.
    // Never use legacy HomeSection.title (it can drift from the admin "Section list").
    const def = config.sectionDefinitions?.find((d) => d.key === sk);
    if (def?.label) blockConfig.title = def.label;
    // No legacy title overrides here.
    // Section titles must come from HomeSectionDefinition (dashboard) only.
    if (taglineByKey[sk] !== undefined) blockConfig.tagline = taglineByKey[sk];
    else if (config.organicTagline && sk === 'organic_tagline') blockConfig.tagline = config.organicTagline;
    if (config.organicIconUrl && (sk === 'organic_tagline' || taglineByKey[sk] !== undefined)) blockConfig.iconUrl = config.organicIconUrl;
    if (blockType === 'heroBanner' || blockType === 'bannerCarousel') {
      const v = carouselByKey[sk];
      blockConfig.carousel = v === undefined ? true : v !== false;
    }

    let data = {};
    if (sk === 'categories' || typeByKey[sk] === 'super_category') {
      data = { categories: categoryByKey[sk] || legacy.categories || [] };
    } else if (sk === 'hero_banner') data = { banners: legacy.heroBanners || [] };
    else if (sk === 'mid_banner') data = { banners: legacy.midBanners || [] };
    else if (/^banner_main_/.test(sk) || typeByKey[sk] === 'banner_main') data = { banners: bannersByKey[sk] || [] };
    else if (/^banner_sub_/.test(sk) || typeByKey[sk] === 'banner_sub') data = { banners: bannersByKey[sk] || [] };
    else if (['deals', 'deals_2', 'wellbeing', 'new_deals', 'fresh_juice'].includes(sk) || typeByKey[sk] === 'collections')
      data = { products: section?.products || [] };
    else if (sk === 'lifestyle' || typeByKey[sk] === 'lifestyle') data = { items: legacy.lifestyle || [] };
    else if (sk === 'greens_banner' || sk === 'section_image') data = { promoBlocks: legacy.promoBlocks || {} };
    else if (sk === 'organic_tagline' || taglineByKey[sk] !== undefined) data = {};

    blocks.push({
      id: `legacy-${sk}-${order}`,
      type: blockType,
      config: blockConfig,
      data,
    });
    order += 1;
  }

  const mergedBlocks = mergeConsecutiveBannerBlocks(blocks, typeByKey);

  return {
    pageId: 'legacy-home',
    slug: 'home',
    title: 'Home',
    version: 1,
    blocks: mergedBlocks,
  };
}

module.exports = { getPageBySlug, getHomePagePayload, resolveBlockData, buildHomePageFromLegacy };
