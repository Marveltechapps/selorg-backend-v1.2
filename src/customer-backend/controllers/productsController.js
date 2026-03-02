const { Product } = require('../models/Product');

async function getProductDetail(req, res) {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: 'Product id required' });
      return;
    }
    const product = await Product.findById(id).lean();
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    const detail = {
      id: String(product._id),
      name: product.name,
      images: Array.isArray(product.images) ? product.images : product.images ? [product.images] : [],
      price: product.price,
      originalPrice: product.originalPrice || product.price,
      discount: product.discount || '',
      description: product.description || '',
      variants:
        Array.isArray(product.variants) && product.variants.length > 0
          ? product.variants.map((v, idx) => ({
              id: String(product._id) + `-v${idx + 1}`,
              size: v.size || product.quantity || '',
              price: v.price || product.price,
              originalPrice: v.originalPrice || product.originalPrice || product.price,
            }))
          : [
              {
                id: String(product._id) + '-v1',
                size: product.quantity || '500 g',
                price: product.price,
                originalPrice: product.originalPrice || product.price,
              },
            ],
    };
    res.status(200).json({ success: true, data: detail });
  } catch (err) {
    console.error('getProductDetail error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getProductDetail };
