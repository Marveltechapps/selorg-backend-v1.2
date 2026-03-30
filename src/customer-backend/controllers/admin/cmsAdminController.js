const { Page } = require('../../models/Page');
const { Collection } = require('../../models/Collection');
const { Media } = require('../../models/Media');
const { Banner } = require('../../models/Banner');
const { Product } = require('../../models/Product');
const { importSkuMaster } = require('../../services/import/skuMasterImport.service');
const { importCmsPages } = require('../../services/import/cmsPagesImport.service');
const { importContentHubMaster } = require('../../services/import/contentHubMasterImport.service');

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
    const { PromoBlock } = require('../../models/PromoBlock');
    const col = await Collection.findById(req.params.id).select('_id slug').lean();
    if (!col) return res.status(404).json({ message: 'Collection not found' });
    const refs = await PromoBlock.find({
      redirectType: 'collection',
      redirectValue: { $in: [String(col._id), col.slug] },
    })
      .select('_id blockKey')
      .lean();
    if (refs.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Collection is referenced by promo blocks',
        references: refs,
      });
    }
    const collection = await Collection.findByIdAndDelete(req.params.id);
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

async function getOverview(req, res) {
  try {
    const [skus, styleCount, variantCount, pages, banners, collections] = await Promise.all([
      Product.countDocuments({}),
      Product.countDocuments({ classification: 'Style' }),
      Product.countDocuments({ classification: 'Variant' }),
      Page.countDocuments({}),
      Banner.countDocuments({}),
      Collection.countDocuments({}),
    ]);

    const [missingPriceProducts, missingImageProducts, inactiveProducts] = await Promise.all([
      Product.find({ $or: [{ price: { $exists: false } }, { price: null }, { price: 0 }] })
        .select('name sku')
        .lean(),
      Product.find({ $or: [{ imageUrl: { $exists: false } }, { imageUrl: '' }] })
        .select('name sku')
        .lean(),
      Product.find({ $or: [{ isActive: false }, { status: { $in: ['inactive', 'draft'] } }] })
        .select('name sku')
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        skuCount: skus,
        styleCount,
        variantCount,
        pagesCount: pages,
        bannersCount: banners,
        collectionsCount: collections,
        missingPriceProducts,
        missingImageProducts,
        inactiveProducts,
      },
    });
  } catch (err) {
    console.error('cms overview error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  getOverview,
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
  /**
   * Excel upload handlers are mounted with multer middleware in routes.
   * These functions should never throw 500 for sheet-level parse errors.
   */
  uploadSkuMaster: async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, counts: {}, errors: [{ message: 'file is required' }] });
    }
    const overwriteRaw = req.body?.overwrite ?? req.query?.overwrite;
    const overwrite = overwriteRaw === undefined ? false : String(overwriteRaw) === 'true';
    try {
      const { counts, errors, warnings, success } = await importSkuMaster(req.file.buffer, { overwrite });
      return res.status(200).json({
        success,
        counts,
        warnings: warnings || [],
        errors,
      });
    } catch (err) {
      return res.status(200).json({
        success: false,
        counts: {},
        errors: [{ message: err.message }],
      });
    }
  },
  uploadContentHubMaster: async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, counts: {}, errors: [{ message: 'file is required' }] });
    }
    const overwriteRaw = req.body?.overwrite ?? req.query?.overwrite;
    const overwrite = overwriteRaw === undefined ? true : String(overwriteRaw) === 'true';
    try {
      const { counts, errors, warnings, success } = await importContentHubMaster(req.file.buffer, { overwrite });
      return res.status(200).json({
        success,
        counts,
        warnings: warnings || [],
        errors,
      });
    } catch (err) {
      return res.status(200).json({
        success: false,
        counts: {},
        errors: [{ message: err.message }],
      });
    }
  },
  uploadCmsPages: async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, counts: {}, errors: [{ message: 'file is required' }] });
    }
    try {
      const { counts, errors } = await importCmsPages(req.file.buffer);
      return res.status(200).json({
        success: errors.length === 0,
        counts,
        errors,
      });
    } catch (err) {
      return res.status(200).json({
        success: false,
        counts: {},
        errors: [{ message: err.message }],
      });
    }
  },
};
