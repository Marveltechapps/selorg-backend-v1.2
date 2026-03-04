const { Collection } = require('../../models/Collection');
const { Product } = require('../../models/Product');
const { Tag } = require('../../models/Tag');

/**
 * Resolve products for a collection (manual or rule-based)
 */
async function resolveCollectionProducts(collectionId) {
  const col = await Collection.findOne({ _id: collectionId, isActive: true }).lean();
  if (!col) return [];

  const now = new Date();
  if (col.schedule) {
    if (col.schedule.startDate && col.schedule.startDate > now) return [];
    if (col.schedule.endDate && col.schedule.endDate < now) return [];
  }

  let productIds = [];

  if (col.type === 'manual' && Array.isArray(col.productIds) && col.productIds.length > 0) {
    productIds = col.productIds;
  } else if (col.type === 'rule-based' && col.rules) {
    const query = { isActive: true, status: 'active' };
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
      .select('name images imageUrl price originalPrice discount quantity')
      .limit(100);

    const sortBy = col.sortBy || 'manual';
    if (sortBy === 'price') products.sort((a, b) => a.price - b.price);
    else if (sortBy === 'priceDesc') products.sort((a, b) => b.price - a.price);
    else if (sortBy === 'createdAt') products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sortBy === 'name') products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return products;
  }

  if (productIds.length === 0) return [];

  const products = await Product.find({ _id: { $in: productIds }, isActive: true })
    .lean()
    .select('name images imageUrl price originalPrice discount quantity');
  const map = new Map(products.map((p) => [String(p._id), p]));
  return productIds.map((id) => map.get(String(id))).filter(Boolean);
}

module.exports = { resolveCollectionProducts };
