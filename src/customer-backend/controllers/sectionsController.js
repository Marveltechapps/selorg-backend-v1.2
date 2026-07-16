const { HomeSection } = require('../models/HomeSection');
const { Product } = require('../models/Product');
const { resolveCuratedSectionProducts } = require('../services/merchandising/curatedHomeSections');

async function respondCurated(res, key, page, limit) {
  const curated = await resolveCuratedSectionProducts(key, { limit: Math.min(50, limit * page) });
  if (!curated || !Array.isArray(curated.products) || curated.products.length === 0) {
    return null;
  }
  const total = curated.products.length;
  const start = (page - 1) * limit;
  const paged = curated.products.slice(start, start + limit);
  return res.json({
    success: true,
    data: {
      title: curated.title,
      viewAllLink: curated.viewAllLink || '',
      products: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    },
  });
}

async function getSectionProducts(req, res) {
  try {
    const { key } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const sort = String(req.query.sort || '').trim();

    const section = await HomeSection.findOne({ sectionKey: key, isActive: true }).lean();
    if (!section) {
      const curatedRes = await respondCurated(res, key, page, limit);
      if (curatedRes) return curatedRes;
      return res.status(404).json({ success: false, message: 'Section not found' });
    }

    const query = {
      _id: { $in: section.productIds || [] },
      isActive: true,
      isSaleable: true,
      classification: 'Style',
    };
    const sortMap = {
      sortOrder: { sortOrder: 1, order: 1, createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      newest: { createdAt: -1 },
      name_asc: { name: 1 },
    };
    const dbSort = sort ? (sortMap[sort] || sortMap.sortOrder) : null;
    const products = await Product.find(query)
      .sort(dbSort || {})
      .select({ baseCost: 0 })
      .lean();

    let ordered = products;
    if (!sort) {
      const orderMap = new Map((section.productIds || []).map((id, idx) => [String(id), idx]));
      ordered = products.sort((a, b) => (orderMap.get(String(a._id)) ?? 9999) - (orderMap.get(String(b._id)) ?? 9999));
    }

    // Empty CMS section (or all SKUs unsaleable) → curated catalog for virtual rails.
    if (ordered.length === 0) {
      const curatedRes = await respondCurated(res, key, page, limit);
      if (curatedRes) return curatedRes;
    }

    const total = ordered.length;
    const start = (page - 1) * limit;
    const paged = ordered.slice(start, start + limit);

    return res.json({
      success: true,
      data: {
        title: section.title || section.sectionKey,
        viewAllLink: section.viewAllLink || '',
        products: paged,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit) || 1),
        },
      },
    });
  } catch (err) {
    console.error('getSectionProducts error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getSectionProducts };
