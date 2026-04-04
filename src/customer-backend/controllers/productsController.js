const { Product } = require('../models/Product');
const { HomeConfig } = require('../models/HomeConfig');
const {
  mapEmbeddedVariants,
  enrichProductsWithVariants,
  pickImageFields,
  filterHierarchySiblingsForProductLine,
} = require('../utils/productVariantsPayload');
const { normalizeDescriptionForClient } = require('../utils/productDescriptionNormalize');

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
        // Keep `meta` for product detail (Origin / Health copy in meta.title/description; customer app Product Information).
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

    let variants = [];
    const embedded = mapEmbeddedVariants(product);
    if (embedded.length > 1) {
      variants = embedded;
    } else if (product.hierarchyCode && String(product.hierarchyCode).trim()) {
      const siblings = await Product.find({
        hierarchyCode: product.hierarchyCode,
        isActive: true,
        isSaleable: true,
      })
        .select({ baseCost: 0, vendorCode: 0, mfgSkuCode: 0, hsnCode: 0, udf: 0, meta: 0 })
        .lean();
      const line = filterHierarchySiblingsForProductLine(product, siblings);
      if (line.length > 1) {
        variants = line.map((s) => {
          const sid = String(s._id);
          return {
            id: sid,
            productId: sid,
            name: s.name,
            size: String(s.size || s.quantity || '').trim() || '1 unit',
            price: Number(s.price ?? 0),
            originalPrice: Number(s.mrp ?? s.originalPrice ?? s.price ?? 0),
            ...pickImageFields(s),
          };
        });
      } else if (line.length === 1) {
        const s = line[0];
        const sid = String(s._id);
        variants = [
          {
            id: sid,
            productId: sid,
            name: s.name,
            size: String(s.size || s.quantity || product.size || product.quantity || '').trim() || '1 unit',
            price: Number(s.price ?? product.price ?? 0),
            originalPrice: Number(s.mrp ?? s.originalPrice ?? product.mrp ?? product.price ?? 0),
            ...pickImageFields(s),
          },
        ];
      }
    } else if (embedded.length === 1) {
      variants = embedded;
    }
    if (variants.length === 0) {
      const pid = String(product._id);
      variants = [
        {
          id: pid,
          productId: pid,
          name: product.name,
          size: String(product.size || product.quantity || '').trim() || '1 unit',
          price: Number(product.price || 0),
          originalPrice: Number(product.mrp ?? product.originalPrice ?? product.price ?? 0),
          ...pickImageFields(product),
        },
      ];
    }

    let relatedProducts = [];
    if (Array.isArray(product.relatedProductIds) && product.relatedProductIds.length > 0) {
      relatedProducts = await Product.find({
        _id: { $in: product.relatedProductIds },
        isActive: true,
        isSaleable: true,
        classification: 'Style',
      })
        .select({ baseCost: 0, vendorCode: 0, mfgSkuCode: 0, hsnCode: 0, udf: 0, meta: 0 })
        .limit(32)
        .lean();
    } else if (product.hierarchyCode) {
      relatedProducts = await Product.find({
        hierarchyCode: product.hierarchyCode,
        _id: { $ne: product._id },
        isActive: true,
        isSaleable: true,
      })
        .select({ baseCost: 0, vendorCode: 0, mfgSkuCode: 0, hsnCode: 0, udf: 0, meta: 0 })
        .limit(32)
        .lean();
    }
    // One card per product line; pack SKUs collapse into variants on each card (dedupe by base title, max 8 lines).
    relatedProducts = await enrichProductsWithVariants(relatedProducts, { maxProductLines: 8 });
    const homeConfig = await HomeConfig.findOne({ key: 'main' }).select('deliveryLabel').lean();
    const enrichedProduct = {
      ...product,
      description: normalizeDescriptionForClient(product.description),
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
    const [rawProducts, total] = await Promise.all([
      Product.find(searchFilter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, sortOrder: 1, order: 1 })
        .skip(skip)
        .limit(limit)
        .select({ baseCost: 0 })
        .lean(),
      Product.countDocuments(searchFilter),
    ]);
    const products = await enrichProductsWithVariants(rawProducts, { dedupeProductLines: false });

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
