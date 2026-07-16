const { Category } = require('../../models/Category');
const { Product } = require('../../models/Product');
const { Collection } = require('../../models/Collection');
const { HomeSection } = require('../../models/HomeSection');
const { enrichProductsWithVariants, pickImageFields } = require('../../utils/productVariantsPayload');
const { enrichProduct } = require('../../utils/customerMediaEnrichment');
const { attachLiveSellableStock } = require('../../utils/productStock');

/** Virtual home rails when mastersheet lifestyle tiles / HomeSection rows are absent. */
const CURATED_SECTION_CATALOG = {
  health: {
    title: 'Your Health Matters',
    viewAllLink: '/categories',
    categorySlugs: ['vegetables', 'millets-mandi', 'dry-powder-mix', 'dry-fruits-seeds'],
    collectionSlugs: ['high-nutrition-products'],
    searchTerms: ['immunity', 'protein', 'organic', 'brahmi', 'moringa'],
  },
  wellness: {
    title: 'Explore Wellness',
    viewAllLink: '/collection/high-nutrition-products',
    categorySlugs: ['tea-breakfast', 'dry-fruits-seeds', 'millets-mandi', 'dry-powder-mix'],
    collectionSlugs: ['high-nutrition-products'],
    searchTerms: ['honey', 'seed', 'millet', 'tea', 'herbal'],
  },
  'your-health-matters': null, // alias → health
  'explore-wellness': null, // alias → wellness
};

function resolveCuratedKey(key) {
  const raw = String(key || '').trim().toLowerCase().replace(/_/g, '-');
  if (raw === 'your-health-matters') return 'health';
  if (raw === 'explore-wellness') return 'wellness';
  if (CURATED_SECTION_CATALOG[raw] && CURATED_SECTION_CATALOG[raw] !== null) return raw;
  return null;
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

async function productsFromCategorySlugs(slugs, limit) {
  const out = [];
  const seen = new Set();
  const perCat = Math.max(3, Math.ceil(limit / Math.max(1, slugs.length)));

  for (const slug of slugs) {
    const cat = await Category.findOne({ slug, isActive: true, level: 1 }).select('_id').lean();
    if (!cat) continue;
    const products = await Product.find({
      classification: 'Style',
      isActive: true,
      isSaleable: true,
      categoryId: cat._id,
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(perCat)
      .select({ baseCost: 0 })
      .lean();
    for (const p of products) {
      const id = String(p._id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function productsFromCollectionSlugs(slugs, limit) {
  const out = [];
  for (const slug of slugs) {
    const col = await Collection.findOne({ slug, isActive: true }).lean();
    if (!col) continue;
    const ids = Array.isArray(col.productIds) ? col.productIds : [];
    if (!ids.length) continue;
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
    out.push(...products);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

async function productsFromSearchTerms(terms, limit) {
  const out = [];
  const seen = new Set();
  for (const term of terms) {
    const regex = new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const products = await Product.find({
      classification: 'Style',
      isActive: true,
      isSaleable: true,
      $or: [{ name: regex }, { tag: regex }, { brand: regex }],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(limit)
      .select({ baseCost: 0 })
      .lean();
    for (const p of products) {
      const id = String(p._id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Build a curated product list for virtual health/wellness home rails.
 * Prefer collection SKUs from mastersheet, then category Style products, then search.
 */
async function resolveCuratedSectionProducts(key, { limit = 20 } = {}) {
  const curatedKey = resolveCuratedKey(key);
  if (!curatedKey) return null;
  const def = CURATED_SECTION_CATALOG[curatedKey];
  if (!def) return null;

  const seen = new Set();
  const merged = [];

  const pushAll = (list) => {
    for (const p of list) {
      const id = String(p._id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(p);
      if (merged.length >= limit) return true;
    }
    return false;
  };

  // Explicit HomeSection row wins when CMS has curated SKUs for this key.
  const section = await HomeSection.findOne({
    sectionKey: { $in: [curatedKey, key, `collections_${curatedKey}`] },
    isActive: true,
  }).lean();
  if (section?.productIds?.length) {
    const products = await Product.find({
      _id: { $in: section.productIds },
      classification: 'Style',
      isActive: true,
      isSaleable: true,
    })
      .select({ baseCost: 0 })
      .lean();
    const order = new Map(section.productIds.map((id, i) => [String(id), i]));
    products.sort((a, b) => (order.get(String(a._id)) ?? 9999) - (order.get(String(b._id)) ?? 9999));
    pushAll(products);
  }

  // Prefer mastersheet category Style products, then keyword hits, then shared collections.
  if (merged.length < limit) {
    pushAll(await productsFromCategorySlugs(def.categorySlugs, limit));
  }
  if (merged.length < limit) {
    pushAll(await productsFromSearchTerms(def.searchTerms, limit));
  }
  if (merged.length < limit) {
    pushAll(await productsFromCollectionSlugs(def.collectionSlugs, limit));
  }

  const enriched = await enrichProductsWithVariants(merged.slice(0, limit), {
    dedupeProductLines: false,
  });
  const withStock = await attachLiveSellableStock(enriched);

  return {
    key: curatedKey,
    title: def.title,
    viewAllLink: def.viewAllLink,
    products: withStock.map(serializeProduct),
  };
}

module.exports = {
  resolveCuratedKey,
  resolveCuratedSectionProducts,
  CURATED_SECTION_CATALOG,
};
