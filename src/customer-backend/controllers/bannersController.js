const { Banner } = require('../models/Banner');
const { Product } = require('../models/Product');

/** Get banner by ID for landing page (public). Resolves productIds in contentItems. */
async function getBannerById(req, res) {
  try {
    const banner = await Banner.findById(req.params.id).lean();
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    /** Allow inactive banners by id (e.g. home carousel enrichment still needs imageUrl for admin-picked slides). */
    const contentItems = (banner.contentItems || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    function collectProductIds(items) {
      let ids = [];
      for (const c of items || []) {
        if (c.type === 'products' && Array.isArray(c.productIds)) {
          ids = ids.concat(c.productIds);
        }
        if (Array.isArray(c.nestedContentItems) && c.nestedContentItems.length > 0) {
          ids = ids.concat(collectProductIds(c.nestedContentItems));
        }
      }
      return ids;
    }

    const productIds = collectProductIds(contentItems);
    const products = productIds.length
      ? await Product.find({
          _id: { $in: productIds },
          isActive: true,
          isSaleable: true,
          classification: 'Style',
        })
          .lean()
          .select({ name: 1, price: 1, mrp: 1, imageUrl: 1, images: 1 })
      : [];
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    function attachProducts(items) {
      return (items || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item) => {
        let out = { ...item };
        if (item.type === 'products' && Array.isArray(item.productIds)) {
          out = {
            ...out,
            products: item.productIds.map((id) => productMap.get(String(id))).filter(Boolean),
          };
        }
        if (Array.isArray(item.nestedContentItems) && item.nestedContentItems.length > 0) {
          out = {
            ...out,
            nestedContentItems: attachProducts(item.nestedContentItems),
          };
        }
        return out;
      });
    }

    const resolvedItems = attachProducts(contentItems);
    res.json({
      success: true,
      data: {
        _id: banner._id,
        title: banner.title,
        imageUrl: banner.imageUrl,
        contentItems: resolvedItems,
      },
    });
  } catch (err) {
    console.error('getBannerById error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getBannerById };
