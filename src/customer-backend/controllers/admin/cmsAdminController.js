const { Page } = require('../../models/Page');
const { Collection } = require('../../models/Collection');
const { Media } = require('../../models/Media');
const { Banner } = require('../../models/Banner');
const { Product } = require('../../models/Product');
const { HomeSection } = require('../../models/HomeSection');
const { Button } = require('../../models/Button');
const mongoose = require('mongoose');
const { ContentHubImportRun } = require('../../models/ContentHubImportRun');
const { importSkuMaster } = require('../../services/import/skuMasterImport.service');
const { importCmsPages } = require('../../services/import/cmsPagesImport.service');
const { importContentHubMaster } = require('../../services/import/contentHubMasterImport.service');
const cacheService = require('../../../core/services/cache.service');

/**
 * Invalidate customer-facing response caches after a mastersheet write so the
 * customer app reflects the new layout/categories/banners immediately instead
 * of waiting up to 60s for the TTL to expire.
 */
async function invalidateCustomerCachesSafely() {
  try {
    await cacheService.delPattern('cache:*');
  } catch (err) {
    console.error('cache invalidation after upload failed', err);
  }
}

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

// --- Banner CRUD ---
// NOTE: Banner model uses `title` field; frontend sends `name`.
// We map `name` ↔ `title` for compatibility.

function bannerToResponse(banner) {
  if (!banner) return banner;
  const obj = typeof banner.toObject === 'function' ? banner.toObject() : banner;
  return { ...obj, name: obj.title || obj.name || '' };
}

async function listBanners(req, res) {
  try {
    const banners = await Banner.find().sort({ order: 1, updatedAt: -1 }).lean();
    res.json(banners.map(bannerToResponse));
  } catch (err) {
    console.error('listBanners error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createBanner(req, res) {
  try {
    const { name, title, bannerId, imageUrl, bannerType, sectionCode, isActive, order } = req.body;
    const bannerTitle = (title || name || '').trim();
    if (!bannerTitle) return res.status(400).json({ message: 'Banner name is required' });
    const banner = await Banner.create({
      title: bannerTitle,
      bannerId: bannerId?.trim() || '',
      imageUrl: imageUrl?.trim() || '',
      bannerType: bannerType?.trim() || '',
      sectionCode: sectionCode?.trim() || '',
      isActive: isActive ?? true,
      order: order ?? 0,
    });
    res.status(201).json(bannerToResponse(banner.toObject()));
  } catch (err) {
    console.error('createBanner error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateBanner(req, res) {
  try {
    const updates = { ...req.body };
    delete updates._id;
    // Map `name` → `title` if provided
    if (updates.name !== undefined) {
      if (!updates.name?.trim()) {
        return res.status(400).json({ message: 'Banner name cannot be empty' });
      }
      updates.title = updates.name.trim();
      delete updates.name;
    }
    const banner = await Banner.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json(bannerToResponse(banner));
  } catch (err) {
    console.error('updateBanner error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function deleteBanner(req, res) {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteBanner error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// --- HomeSection CRUD ---
// NOTE: HomeSection model uses `title` field; frontend sends `label`.
// We map `label` ↔ `title` for compatibility.

function homeSectionToResponse(section) {
  if (!section) return section;
  const obj = typeof section.toObject === 'function' ? section.toObject() : section;
  return { ...obj, label: obj.title || obj.label || '' };
}

async function listHomeSections(req, res) {
  try {
    const sections = await HomeSection.find().sort({ order: 1, updatedAt: -1 }).lean();
    res.json(sections.map(homeSectionToResponse));
  } catch (err) {
    console.error('listHomeSections error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createHomeSection(req, res) {
  try {
    const { sectionKey, sectionType, label, title, bannerIds, categoryIds, videoUrl, order, isActive } = req.body;
    if (!sectionKey?.trim()) return res.status(400).json({ message: 'Section key is required' });
    const section = await HomeSection.create({
      sectionKey: sectionKey.trim(),
      sectionType: sectionType || 'products',
      title: (title || label || '').trim(),
      bannerIds: bannerIds || [],
      categoryIds: categoryIds || [],
      videoUrl: videoUrl?.trim() || '',
      order: order ?? 0,
      isActive: isActive ?? true,
    });
    res.status(201).json(homeSectionToResponse(section.toObject()));
  } catch (err) {
    console.error('createHomeSection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateHomeSection(req, res) {
  try {
    const updates = { ...req.body };
    delete updates._id;
    if (updates.sectionKey !== undefined && !updates.sectionKey?.trim()) {
      return res.status(400).json({ message: 'Section key cannot be empty' });
    }
    // Map `label` → `title` if provided
    if (updates.label !== undefined) {
      updates.title = (updates.label || '').trim();
      delete updates.label;
    }
    const section = await HomeSection.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!section) return res.status(404).json({ message: 'HomeSection not found' });
    res.json(homeSectionToResponse(section));
  } catch (err) {
    console.error('updateHomeSection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function deleteHomeSection(req, res) {
  try {
    const section = await HomeSection.findByIdAndDelete(req.params.id);
    if (!section) return res.status(404).json({ message: 'HomeSection not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteHomeSection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// --- Button CRUD ---

async function listButtons(req, res) {
  try {
    const buttons = await Button.find().sort({ order: 1, updatedAt: -1 }).lean();
    res.json(buttons);
  } catch (err) {
    console.error('listButtons error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createButton(req, res) {
  try {
    const { name, buttonId, label, type, action, icon, imageUrl, sectionCode, isActive, order } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Button name is required' });
    const button = await Button.create({
      name: name.trim(),
      buttonId: buttonId?.trim() || '',
      label: label?.trim() || '',
      type: type || 'action',
      action: action?.trim() || '',
      icon: icon?.trim() || '',
      imageUrl: imageUrl?.trim() || '',
      sectionCode: sectionCode?.trim() || '',
      isActive: isActive ?? true,
      order: order ?? 0,
    });
    res.status(201).json(button);
  } catch (err) {
    console.error('createButton error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateButton(req, res) {
  try {
    const updates = { ...req.body };
    delete updates._id;
    if (updates.name !== undefined && !updates.name?.trim()) {
      return res.status(400).json({ message: 'Button name cannot be empty' });
    }
    const button = await Button.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!button) return res.status(404).json({ message: 'Button not found' });
    res.json(button);
  } catch (err) {
    console.error('updateButton error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function deleteButton(req, res) {
  try {
    const button = await Button.findByIdAndDelete(req.params.id);
    if (!button) return res.status(404).json({ message: 'Button not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteButton error:', err);
    res.status(500).json({ message: 'Internal server error' });
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
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listHomeSections,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  listButtons,
  createButton,
  updateButton,
  deleteButton,
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
      if (success) await invalidateCustomerCachesSafely();
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
    const startedAt = Date.now();
    const uploadedByRaw = req.user?.userId || req.user?._id || null;
    const uploadedBy = mongoose.Types.ObjectId.isValid(String(uploadedByRaw || ''))
      ? new mongoose.Types.ObjectId(String(uploadedByRaw))
      : null;
    try {
      const { counts, errors, warnings, success } = await importContentHubMaster(req.file.buffer, { overwrite });
      if (success) await invalidateCustomerCachesSafely();
      try {
        await ContentHubImportRun.create({
          source: 'content-hub',
          uploadedBy,
          file: {
            originalName: req.file?.originalname || '',
            mimeType: req.file?.mimetype || '',
            sizeBytes: Number(req.file?.size || 0),
          },
          overwrite,
          success: Boolean(success),
          durationMs: Date.now() - startedAt,
          counts: counts || {},
          warnings: Array.isArray(warnings) ? warnings : [],
          importErrors: Array.isArray(errors) ? errors : [],
        });
      } catch (e) {
        console.error('ContentHubImportRun.create failed', e);
      }
      return res.status(200).json({
        success,
        counts,
        warnings: warnings || [],
        errors,
      });
    } catch (err) {
      try {
        await ContentHubImportRun.create({
          source: 'content-hub',
          uploadedBy,
          file: {
            originalName: req.file?.originalname || '',
            mimeType: req.file?.mimetype || '',
            sizeBytes: Number(req.file?.size || 0),
          },
          overwrite,
          success: false,
          durationMs: Date.now() - startedAt,
          counts: {},
          warnings: [],
          importErrors: [{ message: err.message }],
        });
      } catch (e) {
        console.error('ContentHubImportRun.create failed', e);
      }
      return res.status(200).json({
        success: false,
        counts: {},
        errors: [{ message: err.message }],
      });
    }
  },
  listContentHubImportRuns: async (req, res) => {
    try {
      const limitRaw = req.query?.limit;
      const limit = Math.min(50, Math.max(1, Number.parseInt(String(limitRaw || '20'), 10) || 20));
      const items = await ContentHubImportRun.find({ source: 'content-hub' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      const data = items.map((item) => ({
        ...item,
        errors: item.importErrors || [],
      }));
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('listContentHubImportRuns error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
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
