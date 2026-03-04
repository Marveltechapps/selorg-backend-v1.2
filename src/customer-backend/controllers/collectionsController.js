const { Collection } = require('../models/Collection');
const { resolveCollectionProducts } = require('../services/merchandising/collectionService');

async function getCollectionBySlug(req, res) {
  try {
    const { slug } = req.params;
    const mongoose = require('mongoose');
    const isObjectId = mongoose.Types.ObjectId.isValid(slug) && String(new mongoose.Types.ObjectId(slug)) === slug;
    const query = isObjectId ? { _id: slug, isActive: true } : { slug, isActive: true };
    const collection = await Collection.findOne(query).lean();
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    const products = await resolveCollectionProducts(collection._id);
    res.status(200).json({
      success: true,
      data: {
        id: String(collection._id),
        name: collection.name,
        slug: collection.slug,
        products,
      },
    });
  } catch (err) {
    console.error('getCollectionBySlug error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getCollectionBySlug };
