const { Product } = require('../../models/Product');
const { Collection } = require('../../models/Collection');
const { HomeSection } = require('../../models/HomeSection');
const { HomeSectionDefinition } = require('../../models/HomeSectionDefinition');
const { enrichProductsWithVariants, pickImageFields } = require('../../utils/productVariantsPayload');
const { enrichProduct } = require('../../utils/customerMediaEnrichment');
const { attachLiveSellableStock } = require('../../utils/productStock');

/**
 * Virtual home rails (health / wellness) resolve ONLY from Master Sheet–backed
 * HomeSection / HomeSectionDefinition / Collection documents — never from
 * hardcoded category slug lists or keyword search inventing product mixes.
 *
 * Matching is by collection/section label or slug aliases published via
 * Content Hub "Home Page Content" → Collections rows.
 */
const RAIL_ALIASES = {
  health: {
    defaultTitle: 'Your Health Matters',
    defaultViewAll: '/categories',
    match: [
      'health',
      'your-health-matters',
      'your health matters',
      'health-matters',
      'health matters',
    ],
  },
  wellness: {
    defaultTitle: 'Explore Wellness',
    defaultViewAll: '/categories',
    // High Nutrition is its own Master Sheet collection carousel — do not alias
    // it into the wellness rail (that hid the High Nutrition deals section while
    // wellness showed a completely different product set).
    match: ['wellness', 'explore-wellness', 'explore wellness'],
  },
};

function resolveCuratedKey(key) {
  const raw = String(key || '').trim().toLowerCase().replace(/_/g, '-');
  if (raw === 'your-health-matters') return 'health';
  if (raw === 'explore-wellness') return 'wellness';
  if (RAIL_ALIASES[raw]) return raw;
  return null;
}

function normalizeMatchToken(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[_]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-');
}

function matchesRailAlias(railKey, labelOrSlug) {
  const def = RAIL_ALIASES[railKey];
  if (!def) return false;
  const token = normalizeMatchToken(labelOrSlug);
  if (!token) return false;
  const compact = token.replace(/[\s-]+/g, '');
  return def.match.some((alias) => {
    const a = normalizeMatchToken(alias);
    const aCompact = a.replace(/[\s-]+/g, '');
    return token === a || compact === aCompact || token.includes(a) || a.includes(token);
  });
}

function serializeProduct(p) {
  const enriched = enrichProduct(p);
  const media = pickImageFields(enriched);
  return {
    id: String(p._id),
    _id: String(p._id),
    name: p.name,
    size: p.size,
    tag: p.tag,
    brand: p.brand || '',
    price: p.price,
    mrp: p.mrp ?? p.originalPrice ?? p.price,
    originalPrice: p.originalPrice ?? p.mrp ?? p.price,
    discount: p.discount,
    imageUrl: media.imageUrl || null,
    thumbnailUrl: media.thumbnailUrl || null,
    cardImageUrl: media.cardImageUrl || null,
    images: Array.isArray(media.images) ? media.images : [],
    stock: p.stock,
    stockQuantity: p.stockQuantity,
    availableStock: p.availableStock,
    storeStock: p.storeStock,
    catalogStockQuantity: p.catalogStockQuantity,
    isSaleable: p.isSaleable,
    variants: Array.isArray(p.variants) ? p.variants : [],
  };
}

async function loadProductsByIds(ids, limit) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const products = await Product.find({
    _id: { $in: ids },
    classification: 'Style',
    isActive: true,
    isSaleable: true,
  })
    .select({ baseCost: 0 })
    .lean();
  const order = new Map(ids.map((id, i) => [String(id), i]));
  products.sort((a, b) => (order.get(String(a._id)) ?? 9999) - (order.get(String(b._id)) ?? 9999));
  return products.slice(0, limit);
}

/**
 * Prefer explicit HomeSection SKUs, then Master Sheet HomeSectionDefinition
 * collections whose label/key matches the rail, then Collection docs by slug/name.
 */
async function resolveCuratedSectionProducts(key, { limit = 20 } = {}) {
  const curatedKey = resolveCuratedKey(key);
  if (!curatedKey) return null;
  const rail = RAIL_ALIASES[curatedKey];
  if (!rail) return null;

  let productIds = [];
  let title = rail.defaultTitle;
  let viewAllLink = rail.defaultViewAll;
  let collectionSlug = null;

  const section = await HomeSection.findOne({
    sectionKey: { $in: [curatedKey, key, `collections_${curatedKey}`] },
    isActive: true,
  }).lean();
  if (section?.productIds?.length) {
    productIds = section.productIds;
    if (section.title) title = section.title;
    if (section.viewAllLink) viewAllLink = section.viewAllLink;
  }

  if (productIds.length === 0) {
    const defs = await HomeSectionDefinition.find({
      type: 'collections',
      collectionId: { $ne: null },
    })
      .sort({ order: 1 })
      .lean();
    const matchedDef = defs.find(
      (d) => matchesRailAlias(curatedKey, d.label) || matchesRailAlias(curatedKey, d.key)
    );
    if (matchedDef?.collectionId) {
      const col = await Collection.findById(matchedDef.collectionId).lean();
      if (col?.productIds?.length) {
        productIds = col.productIds;
        title = matchedDef.label || col.name || title;
        collectionSlug = col.slug || null;
      }
    }
  }

  if (productIds.length === 0) {
    const collections = await Collection.find({ isActive: true }).sort({ updatedAt: -1 }).lean();
    const matched = collections.find(
      (c) => matchesRailAlias(curatedKey, c.name) || matchesRailAlias(curatedKey, c.slug)
    );
    if (matched?.productIds?.length) {
      productIds = matched.productIds;
      title = matched.name || title;
      collectionSlug = matched.slug || null;
    }
  }

  if (productIds.length === 0) return null;

  if (collectionSlug) {
    viewAllLink = `/collection/${encodeURIComponent(collectionSlug)}`;
  }

  const merged = await loadProductsByIds(productIds, limit);
  if (merged.length === 0) return null;

  const enriched = await enrichProductsWithVariants(merged, {
    dedupeProductLines: false,
  });
  const withStock = await attachLiveSellableStock(enriched);

  return {
    key: curatedKey,
    title,
    viewAllLink,
    products: withStock.map(serializeProduct),
  };
}

module.exports = {
  resolveCuratedKey,
  resolveCuratedSectionProducts,
  RAIL_ALIASES,
};
