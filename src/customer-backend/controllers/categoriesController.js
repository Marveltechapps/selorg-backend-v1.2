const mongoose = require('mongoose');
const { Category } = require('../models/Category');
const { Product } = require('../models/Product');
const { getCategoryPayload } = require('../services/categoriesService');

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

async function listCategories(req, res) {
  try {
    const categories = await Category.find({
      isActive: true,
      parentId: { $in: [null, undefined] },
    })
      .sort({ order: 1 })
      .lean();
    const data = (categories || []).map((c) => ({
      id: String(c._id),
      name: c.name,
      slug: c.slug,
      imageUrl: c.imageUrl || '',
      order: c.order ?? 0,
    }));
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('listCategories error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getCategoryDetail(req, res) {
  try {
    const id = req.params.id;
    const subCategoryId = req.query.subCategoryId || null;

    if (!id) {
      res.status(400).json({ success: false, message: 'Category id required' });
      return;
    }
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid category id' });
      return;
    }
    if (subCategoryId != null && subCategoryId !== '' && !isValidObjectId(subCategoryId)) {
      res.status(400).json({ success: false, message: 'Invalid subCategoryId' });
      return;
    }

    const payload = await getCategoryPayload(id, subCategoryId || undefined);
    if (!payload) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }

    res.status(200).json({ success: true, data: payload });
  } catch (err) {
    console.error('getCategoryDetail error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getCategoryProductsBySlug(req, res) {
  try {
    const { slug } = req.params;
    const sort = String(req.query.sort || 'sortOrder');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const inStock = req.query.inStock;
    const subcategory = String(req.query.subcategory || '').trim();

    const category = await Category.findOne({ slug, isActive: true, level: 1 }).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const subcategories = await Category.find({ parentId: category._id, isActive: true }).sort({ order: 1 }).lean();
    const subcategoryId = subcategory ? subcategories.find((s) => s.slug === subcategory)?._id : null;
    const targetCategoryIds = subcategoryId ? [subcategoryId] : subcategories.map((s) => s._id);

    const query = {
      categoryId: { $in: targetCategoryIds.length ? targetCategoryIds : [category._id] },
      classification: 'Style',
      isActive: true,
      isSaleable: true,
    };
    if (String(inStock).toLowerCase() === 'true') {
      query.$or = [{ stock: { $gt: 0 } }, { stockQuantity: { $gt: 0 } }];
    }

    const sortMap = {
      sortOrder: { sortOrder: 1, order: 1, createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      name_asc: { name: 1 },
      newest: { createdAt: -1 },
    };
    const dbSort = sortMap[sort] || sortMap.sortOrder;
    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(dbSort)
        .skip(skip)
        .limit(limit)
        .select('_id sku name size tag price mrp taxPercent imageUrl isSaleable stock stockQuantity categoryId')
        .lean(),
      Product.countDocuments(query),
    ]);

    const productCountBySub = await Product.aggregate([
      { $match: { categoryId: { $in: subcategories.map((s) => s._id) }, classification: 'Style', isActive: true, isSaleable: true } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(productCountBySub.map((c) => [String(c._id), c.count]));

    return res.json({
      success: true,
      data: {
        category: {
          _id: String(category._id),
          name: category.name,
          slug: category.slug,
          imageUrl: category.imageUrl || '',
          emoji: category.emoji || '',
        },
        subcategories: subcategories.map((s) => ({
          _id: String(s._id),
          name: s.name,
          slug: s.slug,
          emoji: s.emoji || '',
          productCount: countMap.get(String(s._id)) || 0,
        })),
        products: products.map((p) => ({ ...p, id: String(p._id) })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error('getCategoryProductsBySlug error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getSubcategoriesByCategorySlug(req, res) {
  try {
    const { slug } = req.params;
    const category = await Category.findOne({ slug, isActive: true, level: 1 }).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    const subcategories = await Category.find({ parentId: category._id, isActive: true }).sort({ order: 1 }).lean();
    const counts = await Product.aggregate([
      { $match: { categoryId: { $in: subcategories.map((s) => s._id) }, classification: 'Style', isActive: true, isSaleable: true } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return res.json({
      success: true,
      data: subcategories.map((s) => ({
        _id: String(s._id),
        name: s.name,
        slug: s.slug,
        emoji: s.emoji || '',
        productCount: countMap.get(String(s._id)) || 0,
      })),
    });
  } catch (err) {
    console.error('getSubcategoriesByCategorySlug error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  listCategories,
  getCategoryDetail,
  getCategoryProductsBySlug,
  getSubcategoriesByCategorySlug,
};
