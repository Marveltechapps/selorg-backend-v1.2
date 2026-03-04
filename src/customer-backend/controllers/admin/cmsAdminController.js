const { Page } = require('../../models/Page');
const { Collection } = require('../../models/Collection');
const { Media } = require('../../models/Media');
const { Site } = require('../../models/Site');
const { REDIRECT_TYPES } = require('../../shared/constants');

async function listPages(req, res) {
  try {
    const pages = await Page.find().sort({ updatedAt: -1 }).lean();
    res.json(pages);
  } catch (err) {
    console.error('listPages error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getPage(req, res) {
  try {
    const page = await Page.findById(req.params.id).lean();
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (err) {
    console.error('getPage error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createPage(req, res) {
  try {
    const { slug, title, status, blocks } = req.body;
    const existing = await Page.findOne({ slug });
    if (existing) return res.status(400).json({ message: 'Page slug already exists' });
    const page = await Page.create({ slug, title: title || '', status: status || 'draft', blocks: blocks || [] });
    res.status(201).json(page);
  } catch (err) {
    console.error('createPage error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updatePage(req, res) {
  try {
    const { slug, title, status, blocks } = req.body;
    const page = await Page.findByIdAndUpdate(
      req.params.id,
      { ...(slug != null && { slug }), ...(title != null && { title }), ...(status != null && { status }), ...(blocks != null && { blocks }) },
      { new: true }
    ).lean();
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (err) {
    console.error('updatePage error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function deletePage(req, res) {
  try {
    const page = await Page.findByIdAndDelete(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deletePage error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function listCollections(req, res) {
  try {
    const collections = await Collection.find().sort({ updatedAt: -1 }).lean();
    res.json(collections);
  } catch (err) {
    console.error('listCollections error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createCollection(req, res) {
  try {
    const { name, slug, type, productIds, rules, sortBy } = req.body;
    const existing = await Collection.findOne({ slug });
    if (existing) return res.status(400).json({ message: 'Collection slug already exists' });
    const collection = await Collection.create({
      name: name || 'Unnamed',
      slug: slug || name?.toLowerCase().replace(/\s+/g, '-') || 'unnamed',
      type: type || 'manual',
      productIds: productIds || [],
      rules: rules || {},
      sortBy: sortBy || 'manual',
    });
    res.status(201).json(collection);
  } catch (err) {
    console.error('createCollection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateCollection(req, res) {
  try {
    const updates = { ...req.body };
    delete updates._id;
    const collection = await Collection.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!collection) return res.status(404).json({ message: 'Collection not found' });
    res.json(collection);
  } catch (err) {
    console.error('updateCollection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function deleteCollection(req, res) {
  try {
    const collection = await Collection.findByIdAndDelete(req.params.id);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteCollection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function listMedia(req, res) {
  try {
    const media = await Media.find().sort({ createdAt: -1 }).lean();
    res.json(media);
  } catch (err) {
    console.error('listMedia error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createMedia(req, res) {
  try {
    const { url, type, altText, width, height } = req.body;
    const media = await Media.create({ url: url || '', type: type || 'image', altText, width, height });
    res.status(201).json(media);
  } catch (err) {
    console.error('createMedia error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function deleteMedia(req, res) {
  try {
    const media = await Media.findByIdAndDelete(req.params.id);
    if (!media) return res.status(404).json({ message: 'Media not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteMedia error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  listPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  listMedia,
  createMedia,
  deleteMedia,
};
