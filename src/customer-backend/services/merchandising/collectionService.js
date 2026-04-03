const { Collection } = require('../../models/Collection');
const { Product } = require('../../models/Product');
const { Tag } = require('../../models/Tag');
const { enrichProduct } = require('../../utils/customerMediaEnrichment');
const { enrichProductsWithVariants } = require('../../utils/productVariantsPayload');

/**
 * Resolve products for a collection (manual or rule-based)
 */
async function resolveCollectionProducts(collectionId, options = {}) {
  const col = await Collection.findOne({ _id: collectionId, isActive: true }).lean();
  if (!col) return [];
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 20));
  const sortOverride = String(options.sort || '').trim();

  const now = new Date();
  if (col.schedule) {
    if (col.schedule.startDate && col.schedule.startDate > now) return [];
    if (col.schedule.endDate && col.schedule.endDate < now) return [];
  }

  let productIds = [];

  if (col.type === 'manual' && Array.isArray(col.productIds) && col.productIds.length > 0) {
    productIds = col.productIds;
  } else if (col.type === 'rule-based' && col.rules) {
    const query = { isActive: true, isSaleable: true, classification: 'Style', status: 'active' };
    const { categoryIds, tagIds, priceMin, priceMax, featured } = col.rules || {};
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      query.$or = [{ categoryId: { $in: categoryIds } }, { subcategoryId: { $in: categoryIds } }];
    }
    if (Array.isArray(tagIds) && tagIds.length > 0) {
      const tags = await Tag.find({ _id: { $in: tagIds } }).lean().select('name slug');
      const tagStrings = tags.map((t) => t.name).filter(Boolean);
      if (tagStrings.length > 0) {
        query.tags = { $in: tagStrings };
      }
    }
    if (typeof priceMin === 'number') query.price = { ...query.price, $gte: priceMin };
    if (typeof priceMax === 'number') query.price = { ...query.price, $lte: priceMax };
    if (featured === true) query.featured = true;

    const products = await Product.find(query)
      .lean()
      .select({
        name: 1,
        images: 1,
        imageUrl: 1,
        thumbnailUrl: 1,
        cardImageUrl: 1,
        price: 1,
        originalPrice: 1,
        discount: 1,
        quantity: 1,
        size: 1,
        tag: 1,
        mrp: 1,
        taxPercent: 1,
        isSaleable: 1,
        stock: 1,
        stockQuantity: 1,
        hierarchyCode: 1,
        variants: 1,
      })
      .limit(100);

    const sortBy = sortOverride || col.sortBy || 'manual';
    if (sortBy === 'price' || sortBy === 'price_asc') products.sort((a, b) => a.price - b.price);
    else if (sortBy === 'priceDesc' || sortBy === 'price_desc') products.sort((a, b) => b.price - a.price);
    else if (sortBy === 'createdAt') products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sortBy === 'name') products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'sortOrder') products.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const start = (page - 1) * limit;
    const sliced = products.slice(start, start + limit);
    const withVariants = await enrichProductsWithVariants(sliced);
    return withVariants.map(enrichProduct);
  }

  if (productIds.length === 0) return [];

  const products = await Product.find({ _id: { $in: productIds }, isActive: true, isSaleable: true, classification: 'Style' })
    .lean()
    .select({
      name: 1,
      images: 1,
      imageUrl: 1,
      thumbnailUrl: 1,
      cardImageUrl: 1,
      price: 1,
      originalPrice: 1,
      discount: 1,
      quantity: 1,
      size: 1,
      tag: 1,
      mrp: 1,
      taxPercent: 1,
      isSaleable: 1,
      stock: 1,
      stockQuantity: 1,
      hierarchyCode: 1,
      variants: 1,
    });
  const map = new Map(products.map((p) => [String(p._id), p]));
  const ordered = productIds.map((id) => map.get(String(id))).filter(Boolean);
  const start = (page - 1) * limit;
  const sliced = ordered.slice(start, start + limit);
  const withVariants = await enrichProductsWithVariants(sliced);
  return withVariants.map(enrichProduct);
}

module.exports = { resolveCollectionProducts };
