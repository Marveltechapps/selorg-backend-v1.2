const { Collection } = require('../models/Collection');
const { resolveCollectionProducts } = require('../services/merchandising/collectionService');

async function getCollectionBySlug(req, res) {
  try {
    const { slug } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const sort = String(req.query.sort || '').trim();
    const mongoose = require('mongoose');
    const isObjectId = mongoose.Types.ObjectId.isValid(slug) && String(new mongoose.Types.ObjectId(slug)) === slug;
    const query = isObjectId ? { _id: slug, isActive: true } : { slug, isActive: true };
    const collection = await Collection.findOne(query).lean();
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    const products = await resolveCollectionProducts(collection._id, { page, limit, sort });
    res.status(200).json({
      success: true,
      data: {
        id: String(collection._id),
        name: collection.name,
        slug: collection.slug,
        products,
        pagination: {
          page,
          limit,
          total: Array.isArray(products) ? products.length : 0,
          totalPages: Array.isArray(products) ? Math.max(1, Math.ceil(products.length / limit)) : 1,
        },
      },
    });
  } catch (err) {
    console.error('getCollectionBySlug error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getCollectionBySlug };
