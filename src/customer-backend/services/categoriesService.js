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

  const rawProducts = await Product.find(
    subCategoryId
      ? {
          ...productQueryBase,
          $or: [
            { categoryId: new mongoose.Types.ObjectId(subCategoryId) },
            { subcategoryId: new mongoose.Types.ObjectId(subCategoryId) },
          ],
        }
      : {
          ...productQueryBase,
          $or: [
            { categoryId: catId },
            { subcategoryId: { $in: subcategoryIds } },
            { categoryId: { $in: subcategoryIds } },
          ],
        }
  )
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

module.exports = { getCategoryPayload };
