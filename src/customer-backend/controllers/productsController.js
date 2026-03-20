const { Product } = require('../models/Product');
const { HomeConfig } = require('../models/HomeConfig');

async function getProductDetail(req, res) {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: 'Product id required' });
      return;
    }
    const product = await Product.findById(id)
      .select({
        baseCost: 0,
        vendorCode: 0,
        mfgSkuCode: 0,
        hsnCode: 0,
        backOrderAllowed: 0,
        backOrderQty: 0,
        serialTracking: 0,
        stackable: 0,
        hazardous: 0,
        poisonous: 0,
        udf: 0,
        meta: 0,
        storeLinks: 0,
        thresholdQty: 0,
      })
      .lean();
    if (!product) {
      return res.status(200).json({
        success: true,
        data: { product: { _id: id, isActive: false }, variants: [], relatedProducts: [] },
      });
    }
    const variants = await Product.find({
      hierarchyCode: product.hierarchyCode,
      isActive: true,
      isSaleable: true,
    })
      .select({ baseCost: 0, vendorCode: 0, mfgSkuCode: 0, hsnCode: 0, udf: 0, meta: 0 })
      .lean();
    let relatedProducts = [];
    if (Array.isArray(product.relatedProductIds) && product.relatedProductIds.length > 0) {
      relatedProducts = await Product.find({
        _id: { $in: product.relatedProductIds },
        isActive: true,
        isSaleable: true,
        classification: 'Style',
      })
        .select({ baseCost: 0, vendorCode: 0, mfgSkuCode: 0, hsnCode: 0, udf: 0, meta: 0 })
        .limit(8)
        .lean();
    } else if (product.hierarchyCode) {
      relatedProducts = await Product.find({
        hierarchyCode: product.hierarchyCode,
        _id: { $ne: product._id },
        isActive: true,
        isSaleable: true,
      })
        .select({ baseCost: 0, vendorCode: 0, mfgSkuCode: 0, hsnCode: 0, udf: 0, meta: 0 })
        .limit(8)
        .lean();
    }
    const homeConfig = await HomeConfig.findOne({ key: 'main' }).select('deliveryLabel').lean();
    const enrichedProduct = {
      ...product,
      deliveryInfo: product.deliveryInfo || homeConfig?.deliveryLabel || '10-min delivery',
    };
    res.status(200).json({ success: true, data: { product: enrichedProduct, variants, relatedProducts } });
  } catch (err) {
    console.error('getProductDetail error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function searchProducts(req, res) {
  try {
    const query = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const category = String(req.query.category || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ success: false, message: 'q must be at least 2 characters' });
    }

    const skip = (page - 1) * limit;
    const searchFilter = {
      $text: { $search: query },
      isActive: true,
      isSaleable: true,
      classification: 'Style',
    };
    if (category) searchFilter.categoryId = category;
    const [products, total] = await Promise.all([
      Product.find(searchFilter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, sortOrder: 1, order: 1 })
        .skip(skip)
        .limit(limit)
        .select({ baseCost: 0 })
        .lean(),
      Product.countDocuments(searchFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: products,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('searchProducts error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function searchSuggestions(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ success: true, data: [] });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const products = await Product.find({
      name: regex,
      isActive: true,
      isSaleable: true,
      classification: 'Style',
    })
      .select({ name: 1, imageUrl: 1, sku: 1, size: 1 })
      .limit(5)
      .maxTimeMS(100)
      .lean();
    return res.json({ success: true, data: products });
  } catch (err) {
    if (String(err?.message || '').toLowerCase().includes('time limit')) {
      return res.json({ success: true, data: [] });
    }
    console.error('searchSuggestions error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function searchTrending(req, res) {
  try {
    const cfg = await HomeConfig.findOne({ key: 'main' }).select('trendingSearches').lean();
    return res.json({ success: true, data: Array.isArray(cfg?.trendingSearches) ? cfg.trendingSearches : [] });
  } catch (err) {
    console.error('searchTrending error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getProductDetail, searchProducts, searchSuggestions, searchTrending };
