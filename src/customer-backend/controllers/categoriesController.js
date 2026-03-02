const mongoose = require('mongoose');
const { Category } = require('../models/Category');
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

module.exports = { listCategories, getCategoryDetail };
