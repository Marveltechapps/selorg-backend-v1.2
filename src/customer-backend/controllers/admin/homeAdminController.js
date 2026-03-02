const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');
const {
  HomeConfig,
  DEFAULT_SECTION_DEFINITIONS,
  validateSectionKeys,
  validateSectionDefinitions,
} = require('../../models/HomeConfig');
const { HomeSection } = require('../../models/HomeSection');
const { HomeSectionDefinition, validateKey } = require('../../models/HomeSectionDefinition');
const { LifestyleItem } = require('../../models/LifestyleItem');
const { PromoBlock } = require('../../models/PromoBlock');
const { Product } = require('../../models/Product');
const { ProductAttribute } = require('../../models/ProductAttribute');
const { uploadProductImage: uploadProductImageToS3 } = require('../../../utils/s3Upload');

exports.listCategories = async (req, res) => {
  const items = await Category.find().sort({ order: 1 }).lean();
  const productCounts = await Product.aggregate([
    { $match: { $or: [{ categoryId: { $exists: true } }, { subcategoryId: { $exists: true } }] } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);
  const subCategoryCounts = await Product.aggregate([
    { $match: { subcategoryId: { $ne: null } } },
    { $group: { _id: '$subcategoryId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  for (const pc of productCounts) { if (pc._id) countMap[pc._id.toString()] = pc.count; }
  for (const sc of subCategoryCounts) { if (sc._id) countMap[sc._id.toString()] = (countMap[sc._id.toString()] || 0) + sc.count; }
  const enriched = items.map(item => ({
    ...item,
    productCount: countMap[item._id.toString()] || 0,
  }));
  res.json({ success: true, data: enriched });
};
function slugify(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'category';
}

async function ensureUniqueSlug(slug, excludeId = null) {
  let base = slug || 'category';
  let candidate = base;
  let n = 0;
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Category.findOne(q).lean();
    if (!exists) return candidate;
    candidate = `${base}-${++n}`;
  }
}

exports.createCategory = async (req, res) => {
  const body = { ...req.body };
  if (body.parentId === '' || body.parentId === null || body.parentId === undefined) {
    body.parentId = null;
  }
  if (!body.slug || String(body.slug).trim() === '') {
    body.slug = await ensureUniqueSlug(slugify(body.name || 'category'));
  } else {
    body.slug = await ensureUniqueSlug(body.slug);
  }
  const created = await Category.create(body);
  res.status(201).json({ success: true, data: created });
};
exports.updateCategory = async (req, res) => {
  const body = { ...req.body };
  if (body.parentId === '' || body.parentId === undefined) {
    body.parentId = null;
  }
  const updated = await Category.findByIdAndUpdate(req.params.id, body, { new: true }).lean();
  res.json({ success: true, data: updated });
};
exports.deleteCategory = async (req, res) => {
  const mongoose = require('mongoose');
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid category ID' });
  }
  const subcats = await Category.find({ parentId: id }).select('_id').lean();
  const subcatIds = subcats.map((s) => s._id);
  const allIds = [id, ...subcatIds];
  const productCount = await Product.countDocuments({
    $or: [
      { categoryId: { $in: allIds } },
      { subcategoryId: { $in: allIds } },
    ],
  });
  if (productCount > 0) {
    return res.status(409).json({
      success: false,
      message: `Cannot delete category: ${productCount} product(s) reference this category or its subcategories. Reassign or remove those products first.`,
    });
  }
  await Category.deleteMany({ parentId: id });
  await Category.findByIdAndDelete(id);
  res.json({ success: true });
};

exports.listBanners = async (req, res) => {
  const items = await Banner.find().sort({ slot: 1, order: 1 }).lean();
  res.json({ success: true, data: items });
};
exports.createBanner = async (req, res) => {
  const created = await Banner.create(req.body);
  res.status(201).json({ success: true, data: created });
};
exports.updateBanner = async (req, res) => {
  const updated = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Banner not found' });
  }
  res.json({ success: true, data: updated });
};
exports.deleteBanner = async (req, res) => {
  const deleted = await Banner.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Banner not found' });
  }
  res.json({ success: true });
};

exports.getHomeConfig = async (req, res) => {
  const cfg = await HomeConfig.findOne({ key: 'main' }).lean();
  const definitionsFromCollection = await getSectionDefinitionsForConfig();
  const sectionDefinitions =
    definitionsFromCollection.length > 0 ? definitionsFromCollection : DEFAULT_SECTION_DEFINITIONS;
  const data = cfg
    ? { ...cfg, sectionDefinitions }
    : { ...cfg, sectionDefinitions };
  res.json({ success: true, data });
};
exports.listHomeConfigs = async (req, res) => {
  const items = await HomeConfig.find().sort({ key: 1 }).lean();
  res.json({ success: true, data: items });
};
exports.createHomeConfig = async (req, res) => {
  const sanitized = sanitizeHomeConfigBody(req.body);
  if (sanitized.error) {
    return res.status(400).json({ success: false, message: sanitized.error });
  }
  const body = { ...sanitized, key: sanitized.key || 'main' };
  const existing = await HomeConfig.findOne({ key: body.key }).lean();
  if (existing) {
    return res.status(400).json({ success: false, message: 'Config with this key already exists' });
  }
  const created = await HomeConfig.create(body);
  res.status(201).json({ success: true, data: created.toObject ? created.toObject() : created });
};
function sanitizeHomeConfigBody(body) {
  const out = { ...body };
  if (Array.isArray(out.sectionOrder)) {
    if (!validateSectionKeys(out.sectionOrder)) {
      return { error: 'sectionOrder contains invalid section keys' };
    }
  }
  if (Array.isArray(out.sectionDefinitions)) {
    if (!validateSectionDefinitions(out.sectionDefinitions)) {
      return { error: 'sectionDefinitions contains invalid section keys' };
    }
  }
  return out;
}

exports.upsertHomeConfig = async (req, res) => {
  const sanitized = sanitizeHomeConfigBody(req.body);
  if (sanitized.error) {
    return res.status(400).json({ success: false, message: sanitized.error });
  }
  const updated = await HomeConfig.findOneAndUpdate({ key: 'main' }, sanitized, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  res.json({ success: true, data: updated });
};
exports.updateHomeConfig = async (req, res) => {
  const sanitized = sanitizeHomeConfigBody(req.body);
  if (sanitized.error) {
    return res.status(400).json({ success: false, message: sanitized.error });
  }
  const updated = await HomeConfig.findOneAndUpdate({ key: 'main' }, sanitized, { new: true }).lean();
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Home config not found' });
  }
  res.json({ success: true, data: updated });
};
exports.deleteHomeConfig = async (req, res) => {
  try {
    const deleted = await HomeConfig.findOneAndDelete({ key: 'main' });
    return res.json({ success: true, deleted: !!deleted });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete home config',
    });
  }
};

// Section definitions (list of section keys + labels, full CRUD)
async function getSectionDefinitionsForConfig() {
  const items = await HomeSectionDefinition.find().sort({ order: 1 }).lean();
  return items.map((d) => ({ key: d.key, label: d.label || d.key }));
}

exports.listSectionDefinitions = async (req, res) => {
  let items = await HomeSectionDefinition.find().sort({ order: 1 }).lean();
  if (items.length === 0) {
    await HomeSectionDefinition.insertMany(
      DEFAULT_SECTION_DEFINITIONS.map((d, i) => ({ key: d.key, label: d.label, order: i }))
    );
    items = await HomeSectionDefinition.find().sort({ order: 1 }).lean();
  }
  res.json({ success: true, data: items });
};
exports.createSectionDefinition = async (req, res) => {
  const { key, label, order } = req.body || {};
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ success: false, message: 'key is required' });
  }
  if (!validateKey(key)) {
    return res.status(400).json({ success: false, message: 'key must be one of the allowed section keys' });
  }
  const existing = await HomeSectionDefinition.findOne({ key }).lean();
  if (existing) {
    return res.status(400).json({ success: false, message: 'A section definition with this key already exists' });
  }
  const created = await HomeSectionDefinition.create({
    key,
    label: typeof label === 'string' ? label : key,
    order: typeof order === 'number' ? order : 0,
  });
  res.status(201).json({ success: true, data: created.toObject ? created.toObject() : created });
};
exports.updateSectionDefinition = async (req, res) => {
  const { label, order } = req.body || {};
  const update = {};
  if (typeof label === 'string') update.label = label;
  if (typeof order === 'number') update.order = order;
  const updated = await HomeSectionDefinition.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Section definition not found' });
  }
  res.json({ success: true, data: updated });
};
exports.deleteSectionDefinition = async (req, res) => {
  const deleted = await HomeSectionDefinition.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Section definition not found' });
  }
  res.json({ success: true });
};

exports.listHomeSections = async (req, res) => {
  const items = await HomeSection.find().sort({ order: 1 }).lean();
  res.json({ success: true, data: items });
};
exports.createHomeSection = async (req, res) => {
  const created = await HomeSection.create(req.body);
  res.status(201).json({ success: true, data: created });
};
exports.updateHomeSection = async (req, res) => {
  const updated = await HomeSection.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  res.json({ success: true, data: updated });
};
exports.deleteHomeSection = async (req, res) => {
  await HomeSection.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};

exports.listLifestyle = async (req, res) => {
  const items = await LifestyleItem.find().sort({ order: 1 }).lean();
  res.json({ success: true, data: items });
};
exports.createLifestyle = async (req, res) => {
  const created = await LifestyleItem.create(req.body);
  res.status(201).json({ success: true, data: created });
};
exports.updateLifestyle = async (req, res) => {
  const updated = await LifestyleItem.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  res.json({ success: true, data: updated });
};
exports.deleteLifestyle = async (req, res) => {
  await LifestyleItem.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};

exports.listPromoBlocks = async (req, res) => {
  const items = await PromoBlock.find().sort({ order: 1 }).lean();
  res.json({ success: true, data: items });
};
exports.createPromoBlock = async (req, res) => {
  const created = await PromoBlock.create(req.body);
  res.status(201).json({ success: true, data: created });
};
exports.updatePromoBlock = async (req, res) => {
  const updated = await PromoBlock.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  res.json({ success: true, data: updated });
};
exports.deletePromoBlock = async (req, res) => {
  await PromoBlock.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};

exports.listProducts = async (req, res) => {
  const { categoryId, status, stock, page, limit, search } = req.query;
  const query = {};
  const andParts = [];

  if (search && String(search).trim()) {
    const s = String(search).trim();
    const regex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    andParts.push({
      $or: [
        { name: regex },
        { sku: regex },
        { brand: regex },
        { description: regex },
      ],
    });
  }

  if (categoryId) {
    andParts.push({
      $or: [
        { categoryId: categoryId },
        { subcategoryId: categoryId },
      ],
    });
  }

  if (andParts.length > 0) {
    query.$and = andParts;
  }
  if (status && status !== 'all') {
    query.status = status;
  }
  if (stock && stock !== 'all') {
    if (stock === 'out_of_stock') {
      query.stockQuantity = 0;
    } else if (stock === 'low_stock') {
      query.$expr = {
        $and: [
          { $gt: ['$stockQuantity', 0] },
          { $lte: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', 10] }] },
        ],
      };
    } else if (stock === 'in_stock') {
      query.$expr = { $gt: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', 10] }] };
    }
  }

  const usePagination = page != null || limit != null;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = usePagination ? (pageNum - 1) * limitNum : 0;
  const limitVal = usePagination ? limitNum : 0;

  const findQuery = Product.find(query)
    .populate('categoryId', 'name slug')
    .populate('subcategoryId', 'name slug')
    .sort({ order: 1, createdAt: -1 })
    .skip(skip);
  if (limitVal > 0) findQuery.limit(limitVal);

  const [items, total] = usePagination
    ? await Promise.all([findQuery.lean(), Product.countDocuments(query)])
    : [await findQuery.lean(), 0];

  if (usePagination) {
    return res.json({
      success: true,
      data: items,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  }
  res.json({ success: true, data: items });
};
exports.createProduct = async (req, res) => {
  const body = { ...req.body };
  if (!body.subcategoryId) body.subcategoryId = null;
  if (body.status) body.isActive = body.status === 'active';

  // Validate categoryId exists when provided
  if (body.categoryId) {
    const category = await Category.findById(body.categoryId).lean();
    if (!category) {
      return res.status(400).json({ success: false, message: 'Invalid category. Category not found.' });
    }
    // Validate subcategoryId belongs to categoryId when both provided
    if (body.subcategoryId) {
      const subcategory = await Category.findById(body.subcategoryId).lean();
      if (!subcategory) {
        return res.status(400).json({ success: false, message: 'Invalid subcategory. Subcategory not found.' });
      }
      const subParentId = subcategory.parentId ? subcategory.parentId.toString() : null;
      const catId = body.categoryId.toString();
      if (subParentId !== catId) {
        return res.status(400).json({ success: false, message: 'Subcategory does not belong to the selected category.' });
      }
    }
  }

  // Check for duplicate SKU (skip if sku is empty)
  const skuToCheck = (body.sku || '').trim();
  if (skuToCheck) {
    const existing = await Product.findOne({ sku: skuToCheck }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: `Product with SKU "${skuToCheck}" already exists.` });
    }
  }

  const created = await Product.create(body);
  const populated = await Product.findById(created._id)
    .populate('categoryId', 'name slug')
    .populate('subcategoryId', 'name slug')
    .lean();
  res.status(201).json({ success: true, data: populated });
};

exports.uploadProductImage = async (req, res) => {
  try {
    const { image: base64Data } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, message: 'image (base64) is required' });
    }
    const url = await uploadProductImageToS3(base64Data);
    res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('[uploadProductImage]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to upload image' });
  }
};

const PRODUCT_UPDATE_KEYS = [
  'name', 'sku', 'description', 'brand', 'price', 'costPrice', 'originalPrice',
  'stockQuantity', 'lowStockThreshold', 'imageUrl', 'images', 'status', 'featured',
  'attributes', 'tags', 'categoryId', 'subcategoryId', 'variants', 'order',
];
exports.updateProduct = async (req, res) => {
  const body = {};
  for (const key of PRODUCT_UPDATE_KEYS) {
    if (req.body[key] !== undefined) body[key] = req.body[key];
  }
  if (body.status !== undefined) body.isActive = body.status === 'active';
  if (body.subcategoryId === '') body.subcategoryId = null;

  // Check for duplicate SKU when sku is being updated (exclude current product)
  if (body.sku !== undefined) {
    const skuToCheck = String(body.sku || '').trim();
    if (skuToCheck) {
      const existing = await Product.findOne({ sku: skuToCheck, _id: { $ne: req.params.id } }).lean();
      if (existing) {
        return res.status(409).json({ success: false, message: `Product with SKU "${skuToCheck}" already exists.` });
      }
    }
  }

  const updated = await Product.findByIdAndUpdate(req.params.id, body, { new: true })
    .populate('categoryId', 'name slug')
    .populate('subcategoryId', 'name slug')
    .lean();
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, data: updated });
};
exports.deleteProduct = async (req, res) => {
  const deleted = await Product.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true });
};

/** Publish product: transition draft → active and trigger downstream sync (Catalog → Warehouse → Dark Store → Customer App). */
exports.publishProduct = async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('categoryId', 'name slug')
    .populate('subcategoryId', 'name slug')
    .lean();
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  if (product.status === 'active') {
    return res.status(400).json({ success: false, message: 'Product is already published' });
  }
  const updated = await Product.findByIdAndUpdate(
    req.params.id,
    { status: 'active', isActive: true },
    { new: true }
  )
    .populate('categoryId', 'name slug')
    .populate('subcategoryId', 'name slug')
    .lean();
  // TODO: emit product.published event for sync to Warehouse/Dark Store (async)
  res.json({ success: true, data: updated });
};

exports.bulkUpdateProducts = async (req, res) => {
  const { ids = [], updates: rawUpdates = {} } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids must be a non-empty array' });
  }
  const mongoose = require('mongoose');
  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) {
    return res.status(400).json({ success: false, message: 'No valid product ids' });
  }

  const setPayload = {};
  for (const key of PRODUCT_UPDATE_KEYS) {
    if (rawUpdates[key] !== undefined) setPayload[key] = rawUpdates[key];
  }
  if (setPayload.status !== undefined) setPayload.isActive = setPayload.status === 'active';
  if (setPayload.subcategoryId === '') setPayload.subcategoryId = null;

  const updateOp = {};
  if (Object.keys(setPayload).length > 0) updateOp.$set = setPayload;
  const stockIncrement = rawUpdates.stockIncrement;
  if (typeof stockIncrement === 'number' && stockIncrement !== 0) {
    updateOp.$inc = { stockQuantity: stockIncrement };
  }

  if (Object.keys(updateOp).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid updates' });
  }

  const result = await Product.updateMany({ _id: { $in: validIds } }, updateOp);
  res.json({ success: true, count: result.modifiedCount });
};

exports.listAttributes = async (req, res) => {
  const items = await ProductAttribute.find().sort({ order: 1 }).lean();
  res.json({ success: true, data: items });
};
exports.createAttribute = async (req, res) => {
  const body = { ...req.body };
  if (body.options && typeof body.options === 'string') {
    body.options = body.options.split(',').map(o => o.trim()).filter(Boolean);
  }
  const created = await ProductAttribute.create(body);
  res.status(201).json({ success: true, data: created });
};
exports.updateAttribute = async (req, res) => {
  const body = { ...req.body };
  if (body.options && typeof body.options === 'string') {
    body.options = body.options.split(',').map(o => o.trim()).filter(Boolean);
  }
  const updated = await ProductAttribute.findByIdAndUpdate(req.params.id, body, { new: true }).lean();
  res.json({ success: true, data: updated });
};
exports.deleteAttribute = async (req, res) => {
  await ProductAttribute.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};
