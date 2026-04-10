/**
 * Category payload for Category Products screen: category, subcategories, banners, products.
 */
const mongoose = require('mongoose');
const { Category } = require('../models/Category');
const { Banner } = require('../models/Banner');
const { Product } = require('../models/Product');
const { enrichProductsWithVariants } = require('../utils/productVariantsPayload');

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
 * @param {string|import('mongoose').Types.ObjectId} subCategoryId
 * @param {string[]} hierarchyCodes
 */
function productTaxonomyOrForSubcategory(subCategoryId, hierarchyCodes) {
  const subOid = new mongoose.Types.ObjectId(String(subCategoryId));
  const or = [{ subcategoryId: subOid }, { categoryId: subOid }];
  if (Array.isArray(hierarchyCodes) && hierarchyCodes.length > 0) {
    or.push({ hierarchyCode: { $in: hierarchyCodes } });
  }
  return or;
}

/**
 * @param {import('mongoose').Types.ObjectId} mainCategoryId
 * @param {Array<{ _id: import('mongoose').Types.ObjectId }>} subcategoryDocs
 */
function productTaxonomyOrForMainCategory(mainCategoryId, subcategoryDocs) {
  const subIds = (subcategoryDocs || []).map((s) => s._id);
  return [
    { categoryId: mainCategoryId },
    { subcategoryId: { $in: subIds } },
    { categoryId: { $in: subIds } },
  ];
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
      const hierarchyCodes = await collectHierarchyCodesForSubcategory(subCategoryId);
      productFilter = {
        ...productQueryBase,
        $or: productTaxonomyOrForSubcategory(subCategoryId, hierarchyCodes),
      };
    }
  } else {
    productFilter = {
      ...productQueryBase,
      $or: productTaxonomyOrForMainCategory(catId, subcategories),
    };
  }

  const rawProducts = await Product.find(productFilter)
    .sort({ order: 1 })
    .limit(DEFAULT_PRODUCT_LIMIT)
    .lean();

  const products = await enrichProductsWithVariants(rawProducts);

  return {
    category: {
      id: String(category._id),
      name: category.name,
      slug: category.slug,
      imageUrl: category.imageUrl || null,
    },
    subcategories: subcategories.map((s) => ({
      id: String(s._id),
      name: s.name,
      slug: s.slug,
      imageUrl: s.imageUrl || null,
    })),
    banners: banners.map((b) => ({
      id: String(b._id),
      imageUrl: b.imageUrl,
      link: b.link || null,
      redirectType: b.redirectType || null,
      redirectValue: b.redirectValue || null,
      title: b.title || null,
    })),
    products: products.map((p) => ({
      id: String(p._id),
      name: p.name,
      images: Array.isArray(p.images) ? p.images : [],
      price: p.price,
      originalPrice: p.originalPrice,
      discount: p.discount,
      quantity:
        p.quantity ||
        (Array.isArray(p.variants) && p.variants[0] ? p.variants[0].size : ''),
      variants: Array.isArray(p.variants) ? p.variants : [],
    })),
  };
}

module.exports = {
  getCategoryPayload,
  collectHierarchyCodesForSubcategory,
  productTaxonomyOrForSubcategory,
  productTaxonomyOrForMainCategory,
};
