const { Banner } = require('../models/Banner');
const { Product } = require('../models/Product');

/** Get banner by ID for landing page (public). Resolves productIds in contentItems. */
async function getBannerById(req, res) {
  try {
    const banner = await Banner.findById(req.params.id).lean();
    if (!banner || !banner.isActive) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    const contentItems = (banner.contentItems || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const productIds = contentItems.filter((c) => c.type === 'products' && Array.isArray(c.productIds)).flatMap((c) => c.productIds);
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds }, isActive: true }).lean()
      : [];
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const resolvedItems = contentItems.map((item) => {
      if (item.type === 'products' && Array.isArray(item.productIds)) {
        return {
          ...item,
          products: item.productIds.map((id) => productMap.get(String(id))).filter(Boolean),
        };
      }
      return item;
    });
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
