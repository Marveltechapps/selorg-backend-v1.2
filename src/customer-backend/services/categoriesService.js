/**
 * Category payload for Category Products screen: category, subcategories, banners, products.
 */
const mongoose = require('mongoose');
const { Category } = require('../models/Category');
const { Banner } = require('../models/Banner');
const { Product } = require('../models/Product');
const { enrichProductsWithVariants, pickImageFields } = require('../utils/productVariantsPayload');
const { enrichProduct, enrichCategory } = require('../utils/customerMediaEnrichment');
const { attachLiveSellableStock } = require('../utils/productStock');
const { pickCategoryMediaFields, pickMaxOrderLimit } = require('../utils/catalogMediaFields');

const DEFAULT_PRODUCT_LIMIT = 50;

/**
 * Collect hierarchy code strings for a level-2 subcategory: its own `hierarchyCodes`
 * plus every level-3 leaf under it. Used when products are linked via `hierarchyCode`
 * but `categoryId` / `subcategoryId` were not set during import.
 * @param {string|import('mongoose').Types.ObjectId} subCategoryId
 * @returns {Promise<string[]>}
 */
async function collectHierarchyCodesForSubcategory(subCategoryId) {
  if (subCategoryId == null || subCategoryId === '') return [];
  if (!mongoose.Types.ObjectId.isValid(String(subCategoryId))) return [];
  const subOid = new mongoose.Types.ObjectId(String(subCategoryId));
  const [subDoc, leaves] = await Promise.all([
    Category.findOne({ _id: subOid, isActive: true }).select('hierarchyCodes').lean(),
    Category.find({ parentId: subOid, level: 3, isActive: true }).select('hierarchyCodes').lean(),
  ]);
  const set = new Set();
  for (const c of subDoc?.hierarchyCodes || []) {
    const t = String(c || '').trim();
    if (t) set.add(t);
  }
  for (const leaf of leaves) {
    for (const c of leaf.hierarchyCodes || []) {
      const t = String(c || '').trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

/**
 * Batch hierarchy-code collection for many subcategories (2 queries total instead of 2N).
 * @param {Array<string|import('mongoose').Types.ObjectId>} subCategoryIds
 * @returns {Promise<Map<string, string[]>>}
 */
async function collectHierarchyCodesForSubcategories(subCategoryIds = []) {
  const map = new Map();
  const oids = [];
  for (const id of subCategoryIds) {
    if (id == null || id === '') continue;
    if (!mongoose.Types.ObjectId.isValid(String(id))) continue;
    oids.push(new mongoose.Types.ObjectId(String(id)));
    map.set(String(id), []);
  }
  if (oids.length === 0) return map;

  const [subs, leaves] = await Promise.all([
    Category.find({ _id: { $in: oids }, isActive: true }).select('_id hierarchyCodes').lean(),
    Category.find({ parentId: { $in: oids }, level: 3, isActive: true })
      .select('parentId hierarchyCodes')
      .lean(),
  ]);

  for (const sub of subs) {
    const set = new Set(map.get(String(sub._id)) || []);
    for (const c of sub.hierarchyCodes || []) {
      const t = String(c || '').trim();
      if (t) set.add(t);
    }
    map.set(String(sub._id), [...set]);
  }
  for (const leaf of leaves) {
    const parentKey = String(leaf.parentId);
    const set = new Set(map.get(parentKey) || []);
    for (const c of leaf.hierarchyCodes || []) {
      const t = String(c || '').trim();
      if (t) set.add(t);
    }
    map.set(parentKey, [...set]);
  }
  return map;
}

/** Matches products whose stored taxonomy is missing (never set during import). */
const MISSING_SUBCATEGORY = {
  $or: [{ subcategoryId: null }, { subcategoryId: { $exists: false } }],
};

/**
 * Strict subcategory filter: stored `subcategoryId` is authoritative.
 * `hierarchyCode` is only consulted for products with NO stored subcategory,
 * so a product explicitly linked elsewhere can never leak into this subcategory.
 * @param {string|import('mongoose').Types.ObjectId} subCategoryId
 * @param {string[]} hierarchyCodes
 */
function productTaxonomyOrForSubcategory(subCategoryId, hierarchyCodes) {
  const subOid = new mongoose.Types.ObjectId(String(subCategoryId));
  const or = [{ subcategoryId: subOid }];
  if (Array.isArray(hierarchyCodes) && hierarchyCodes.length > 0) {
    or.push({
      $and: [MISSING_SUBCATEGORY, { hierarchyCode: { $in: hierarchyCodes } }],
    });
  }
  return or;
}

/**
 * Collect hierarchy codes for a level-1 category and all of its level-2/3 descendants.
 * @param {string|import('mongoose').Types.ObjectId} mainCategoryId
 * @param {Array<{ _id: import('mongoose').Types.ObjectId }>} subcategoryDocs
 * @returns {Promise<string[]>}
 */
async function collectHierarchyCodesForMainCategory(mainCategoryId, subcategoryDocs) {
  const set = new Set();
  if (mainCategoryId != null && mongoose.Types.ObjectId.isValid(String(mainCategoryId))) {
    const main = await Category.findById(mainCategoryId).select('hierarchyCodes').lean();
    for (const c of main?.hierarchyCodes || []) {
      const t = String(c || '').trim();
      if (t) set.add(t);
    }
  }
  for (const sub of subcategoryDocs || []) {
    const codes = await collectHierarchyCodesForSubcategory(sub._id);
    for (const c of codes) set.add(c);
  }
  return [...set];
}

/**
 * Strict main-category filter: stored `categoryId` / `subcategoryId` are
 * authoritative. `hierarchyCode` is only consulted for products with NO stored
 * taxonomy at all, so products linked to another category can never leak in.
 * @param {import('mongoose').Types.ObjectId} mainCategoryId
 * @param {Array<{ _id: import('mongoose').Types.ObjectId }>} subcategoryDocs
 * @param {string[]} [hierarchyCodes]
 * @param {import('mongoose').Types.ObjectId[]} [aliasCategoryIds] - prior category docs with same slug after re-import
 */
function productTaxonomyOrForMainCategory(
  mainCategoryId,
  subcategoryDocs,
  hierarchyCodes = [],
  aliasCategoryIds = []
) {
  const subIds = (subcategoryDocs || []).map((s) => s._id);
  const categoryIds = [
    mainCategoryId,
    ...(aliasCategoryIds || []).filter(Boolean),
  ];
  const or = [
    { categoryId: { $in: categoryIds } },
    { subcategoryId: { $in: subIds } },
  ];
  if (Array.isArray(hierarchyCodes) && hierarchyCodes.length > 0) {
    or.push({
      $and: [
        { $or: [{ categoryId: null }, { categoryId: { $exists: false } }] },
        MISSING_SUBCATEGORY,
        { hierarchyCode: { $in: hierarchyCodes } },
      ],
    });
  }
  return or;
}

/**
 * Get full category payload: category, subcategories, banners, products.
 * Products are filtered by category + all subcategories, or by subCategoryId when provided.
 * @param {string} categoryId - Main category (top-level or any) id
 * @param {string} [subCategoryId] - Optional subcategory to filter products
 * @returns {Promise<{ category: object, subcategories: array, banners: array, products: array }>}
 */
async function getCategoryPayload(categoryId, subCategoryId = null) {
  const category = await Category.findOne({
    _id: categoryId,
    isActive: true,
  })
    .lean();

  if (!category) {
    return null;
  }

  const catId = category._id;

  const [subcategories, banners] = await Promise.all([
    Category.find({ parentId: catId, isActive: true }).sort({ order: 1 }).lean(),
    Banner.find({
      slot: 'category',
      categoryId: catId,
      isActive: true,
    }).sort({ order: 1 }).lean(),
  ]);

  const subcategoryIds = subcategories.map((s) => s._id);

  // Product taxonomy:
  // - `Product.categoryId` = level-1 category (main category)
  // - `Product.subcategoryId` = level-2 category (sub category)
  // When user selects a subcategory, we must filter by `subcategoryId`,
  // otherwise the product grid becomes empty.
  const productQueryBase = {
    isActive: true,
    isSaleable: true,
    classification: 'Style',
  };

  let productFilter;
  if (subCategoryId != null && String(subCategoryId).trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(String(subCategoryId))) {
      productFilter = { ...productQueryBase, _id: { $in: [] } };
    } else {
      const {
        findSameNamedSubcategoryTwins,
      } = require('../utils/categoryTaxonomyCleanup');
      const selected =
        subcategories.find((s) => String(s._id) === String(subCategoryId)) ||
        (await Category.findById(subCategoryId).select('_id name slug').lean());
      const twins = findSameNamedSubcategoryTwins(selected, subcategories);
      const taxonomyOr = [];
      for (const twin of twins.length ? twins : [{ _id: subCategoryId }]) {
        const hierarchyCodes = await collectHierarchyCodesForSubcategory(twin._id);
        taxonomyOr.push(...productTaxonomyOrForSubcategory(twin._id, hierarchyCodes));
      }
      productFilter = {
        ...productQueryBase,
        $or: taxonomyOr,
      };
    }
  } else {
    const hierarchyCodes = await collectHierarchyCodesForMainCategory(catId, subcategories);
    productFilter = {
      ...productQueryBase,
      $or: productTaxonomyOrForMainCategory(catId, subcategories, hierarchyCodes),
    };
  }

  // NOTE: no fallback to the whole category when a subcategory is empty —
  // that used to leak unrelated products into subcategory views.
  const rawProducts = await Product.find(productFilter)
    .sort({ sortOrder: 1, order: 1, createdAt: -1 })
    .limit(DEFAULT_PRODUCT_LIMIT)
    .lean();

  const products = await attachLiveSellableStock(
    await enrichProductsWithVariants(rawProducts)
  );

  const categoryOut = enrichCategory(category);
  return {
    category: {
      id: String(category._id),
      name: category.name,
      slug: category.slug,
      imageUrl: categoryOut.imageUrl || categoryOut.thumbnailUrl || null,
      thumbnailUrl: categoryOut.thumbnailUrl || null,
      cardImageUrl: categoryOut.cardImageUrl || null,
      // Categories (L1) do not carry banner/video/YouTube — only SubCategories do.
    },
    subcategories: subcategories.map((s) => {
      const sub = enrichCategory(s);
      const media = pickCategoryMediaFields(s);
      return {
        id: String(s._id),
        name: s.name,
        slug: s.slug,
        imageUrl: sub.imageUrl || sub.thumbnailUrl || null,
        thumbnailUrl: sub.thumbnailUrl || null,
        cardImageUrl: sub.cardImageUrl || null,
        bannerImage: media.bannerImage,
        bannerVideo: media.bannerVideo,
        youtubeUrl: media.youtubeUrl,
      };
    }),
    banners: banners.map((b) => ({
      id: String(b._id),
      imageUrl: b.imageUrl,
      videoUrl: b.videoUrl || null,
      link: b.link || null,
      redirectType: b.redirectType || null,
      redirectValue: b.redirectValue || null,
      title: b.title || null,
    })),
    products: products.map((p) => {
      const enriched = enrichProduct(p);
      const media = pickImageFields(enriched);
      return {
        id: String(p._id),
        name: p.name,
        imageUrl: media.imageUrl || null,
        thumbnailUrl: media.thumbnailUrl || null,
        cardImageUrl: media.cardImageUrl || null,
        images: Array.isArray(media.images) ? media.images : [],
        price: p.price,
        originalPrice: p.originalPrice,
        discount: p.discount,
        size: p.size || p.quantity ||
          (Array.isArray(p.variants) && p.variants[0] ? p.variants[0].size : '') ||
          '',
        quantity:
          p.quantity ||
          p.size ||
          (Array.isArray(p.variants) && p.variants[0] ? p.variants[0].size : ''),
        variants: Array.isArray(p.variants) ? p.variants : [],
        stock: p.stock,
        stockQuantity: p.stockQuantity,
        availableStock: p.availableStock,
        storeStock: p.storeStock,
        catalogStockQuantity: p.catalogStockQuantity,
        isSaleable: p.isSaleable,
        isActive: p.isActive,
        status: p.status,
        maxOrderLimit: pickMaxOrderLimit(p),
      };
    }),
  };
}

module.exports = {
  getCategoryPayload,
  collectHierarchyCodesForSubcategory,
  collectHierarchyCodesForSubcategories,
  collectHierarchyCodesForMainCategory,
  productTaxonomyOrForSubcategory,
  productTaxonomyOrForMainCategory,
};
