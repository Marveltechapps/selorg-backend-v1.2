const mongoose = require('mongoose');
const { Category } = require('../models/Category');
const { Product } = require('../models/Product');
const { StoreInventory } = require('../models/StoreInventory');
const {
  getCategoryPayload,
  collectHierarchyCodesForSubcategory,
  collectHierarchyCodesForSubcategories,
  collectHierarchyCodesForMainCategory,
  productTaxonomyOrForSubcategory,
  productTaxonomyOrForMainCategory,
} = require('../services/categoriesService');
const { enrichProductsWithVariants, pickImageFields } = require('../utils/productVariantsPayload');
const { enrichProduct, enrichCategory } = require('../utils/customerMediaEnrichment');
const { attachLiveSellableStock } = require('../utils/productStock');
const { filterCatalogLabels } = require('../utils/filterDummyCatalog');
const {
  dedupeSubcategoriesByName,
  findSameNamedSubcategoryTwins,
  normalizeCategoryName,
  pickCanonicalSubcategory,
} = require('../utils/categoryTaxonomyCleanup');

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
    // Dedupe case-variant L1s ("RICE Mandi" / "Rice Mandi") — keep first by order.
    const seenNames = new Set();
    const deduped = [];
    for (const c of categories || []) {
      const key = String(c.name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      deduped.push(c);
    }
    const data = filterCatalogLabels(
      deduped.map((c) => {
        const media = enrichCategory(c);
        return {
          id: String(c._id),
          name: c.name,
          slug: c.slug,
          imageUrl: media.imageUrl || '',
          thumbnailUrl: media.thumbnailUrl || '',
          cardImageUrl: media.cardImageUrl || '',
          emoji: c.emoji || '',
          order: c.order ?? 0,
        };
      })
    );
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

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getCategoryProductsBySlug(req, res) {
  try {
    const { slug } = req.params;
    const sort = String(req.query.sort || 'sortOrder');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const inStock = req.query.inStock;
    const subcategory = String(req.query.subcategory || '').trim();

    const slugNorm = String(slug || '').trim().toLowerCase();
    const nameFromSlug = slugNorm.replace(/-/g, ' ');
    // Resolve by slug OR case-insensitive name ("Rice Mandi" / "RICE Mandi" / "rice-mandi").
    let category = await Category.findOne({ slug: slugNorm, isActive: true, level: 1 }).lean();
    if (!category) {
      category = await Category.findOne({
        isActive: true,
        level: 1,
        name: new RegExp(`^${escapeRegex(nameFromSlug)}$`, 'i'),
      }).lean();
    }
    if (!category) {
      category = await Category.findOne({
        isActive: true,
        parentId: { $in: [null, undefined] },
        name: new RegExp(`^${escapeRegex(nameFromSlug)}$`, 'i'),
      }).lean();
    }
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const subcategories = await Category.find({ parentId: category._id, isActive: true }).sort({ order: 1 }).lean();
    const subcategoryLower = subcategory.toLowerCase();
    // Prefer the L2 with products when several suffix-slugs share a name
    // (boiled-rice-3 empty vs boiled-rice-9 populated).
    let subcategoryId = null;
    if (subcategory) {
      const nameFromSubSlug = normalizeCategoryName(
        subcategoryLower.replace(/-\d+$/, '').replace(/-/g, ' ')
      );
      const nameMatches = subcategories.filter(
        (s) =>
          s.slug === subcategory ||
          s.slug === subcategoryLower ||
          normalizeCategoryName(s.name) === nameFromSubSlug ||
          normalizeCategoryName(s.name) === normalizeCategoryName(subcategoryLower.replace(/-/g, ' '))
      );
      if (nameMatches.length === 1) {
        subcategoryId = nameMatches[0]._id;
      } else if (nameMatches.length > 1) {
        const scored = await Promise.all(
          nameMatches.map(async (s) => {
            const codes = await collectHierarchyCodesForSubcategory(s._id);
            const n = await Product.countDocuments({
              classification: 'Style',
              isActive: true,
              isSaleable: true,
              $or: productTaxonomyOrForSubcategory(s._id, codes),
            });
            return { ...s, productCount: n };
          })
        );
        subcategoryId = pickCanonicalSubcategory(scored)?._id || nameMatches[0]._id;
      }
    }

    // Include prior / duplicate L1 docs with same slug OR same name (case-insensitive)
    // so products still linked to legacy "RICE Mandi" / "Rice Mandi" ObjectIds remain visible.
    const aliasCategoryIds = (
      await Category.find({
        parentId: { $in: [null, undefined] },
        $or: [
          { slug: category.slug },
          { name: new RegExp(`^${escapeRegex(category.name)}$`, 'i') },
        ],
      })
        .select('_id')
        .lean()
    )
      .map((c) => c._id)
      .filter((id) => String(id) !== String(category._id));

    // Also include L2s under alias L1s so subcategoryId matches still resolve.
    const aliasSubs =
      aliasCategoryIds.length > 0
        ? await Category.find({ parentId: { $in: aliasCategoryIds }, isActive: true })
            .select('_id name slug hierarchyCodes')
            .lean()
        : [];
    const allSubsForTaxonomy = [...subcategories, ...aliasSubs];

    let taxonomyOr;
    if (subcategoryId) {
      const subDoc =
        subcategories.find((s) => String(s._id) === String(subcategoryId)) ||
        allSubsForTaxonomy.find((s) => String(s._id) === String(subcategoryId));
      // Union every same-named L2 under this L1 and alias L1s (re-import suffix dupes).
      const twinSubs = findSameNamedSubcategoryTwins(subDoc, allSubsForTaxonomy);
      taxonomyOr = [];
      const allCodes = new Set();
      for (const twin of twinSubs) {
        const codes = await collectHierarchyCodesForSubcategory(twin._id);
        for (const c of codes) allCodes.add(c);
        taxonomyOr.push(...productTaxonomyOrForSubcategory(twin._id, codes));
      }
      if (taxonomyOr.length === 0) {
        const codes = await collectHierarchyCodesForSubcategory(subcategoryId);
        taxonomyOr = productTaxonomyOrForSubcategory(subcategoryId, codes);
      }
      // Shared hierarchy codes across twins (products with missing subcategoryId).
      if (allCodes.size > 0) {
        taxonomyOr.push(
          ...productTaxonomyOrForSubcategory(subcategoryId, [...allCodes]).filter(
            (clause) => clause.$and
          )
        );
      }
    } else {
      const codes = await collectHierarchyCodesForMainCategory(category._id, allSubsForTaxonomy);
      taxonomyOr = productTaxonomyOrForMainCategory(
        category._id,
        allSubsForTaxonomy,
        codes,
        aliasCategoryIds
      );
    }

    const storeId = String(req.query.storeId || '').trim();

    let query = {
      classification: 'Style',
      isActive: true,
      isSaleable: true,
      $or: taxonomyOr,
    };

    if (storeId) {
      const availableItems = await StoreInventory.find(
        { storeId, isAvailable: true, quantity: { $gt: 0 } }
      ).select('productId').lean();
      const availableIds = availableItems.map((i) => i.productId);
      query._id = { $in: availableIds };
    }

    if (String(inStock).toLowerCase() === 'true') {
      query = {
        $and: [
          query,
          { $or: [{ stock: { $gt: 0 } }, { stockQuantity: { $gt: 0 } }] },
        ],
      };
    }

    const sortMap = {
      sortOrder: { sortOrder: 1, order: 1, createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      name_asc: { name: 1 },
      newest: { createdAt: -1 },
    };
    const dbSort = sortMap[sort] || sortMap.sortOrder;
    const skip = (page - 1) * limit;
    const [rawProducts, total] = await Promise.all([
      Product.find(query)
        .sort(dbSort)
        .skip(skip)
        .limit(limit)
        .select(
          '_id sku name size tag price mrp taxPercent imageUrl thumbnailUrl cardImageUrl images isSaleable isActive status stock stockQuantity categoryId subcategoryId',
        )
        .lean(),
      Product.countDocuments(query),
    ]);
    const products = await enrichProductsWithVariants(rawProducts, { dedupeProductLines: false });
    const productsWithStock = await attachLiveSellableStock(products, {
      storeId: storeId || null,
    });

    const codesBySub = await collectHierarchyCodesForSubcategories(
      subcategories.map((s) => s._id)
    );
    const productCountEntries = await Promise.all(
      subcategories.map(async (s) => {
        const codes = codesBySub.get(String(s._id)) || [];
        const match = {
          classification: 'Style',
          isActive: true,
          isSaleable: true,
          $or: productTaxonomyOrForSubcategory(s._id, codes),
        };
        const count = await Product.countDocuments(match);
        return [String(s._id), count];
      })
    );
    const countMap = new Map(productCountEntries);

    const mappedSubs = subcategories.map((s) => {
      const media = enrichCategory(s);
      return {
        _id: String(s._id),
        name: s.name,
        slug: s.slug,
        emoji: s.emoji || '',
        imageUrl: media.imageUrl || '',
        thumbnailUrl: media.thumbnailUrl || '',
        cardImageUrl: media.cardImageUrl || '',
        productCount: countMap.get(String(s._id)) || 0,
      };
    });

    return res.json({
      success: true,
      data: {
        category: {
          _id: String(category._id),
          name: category.name,
          slug: category.slug,
          imageUrl: category.imageUrl || '',
          emoji: category.emoji || '',
        },
        subcategories: filterCatalogLabels(dedupeSubcategoriesByName(mappedSubs)),
        products: productsWithStock.map((p) => {
          const enriched = enrichProduct(p);
          const media = pickImageFields(enriched);
          return {
            id: String(p._id),
            name: p.name,
            size: p.size,
            tag: p.tag,
            price: p.price,
            mrp: p.mrp,
            imageUrl: media.imageUrl || null,
            thumbnailUrl: media.thumbnailUrl || null,
            cardImageUrl: media.cardImageUrl || null,
            images: Array.isArray(media.images) ? media.images : [],
            variants: Array.isArray(p.variants) ? p.variants : [],
            stock: p.stock,
            stockQuantity: p.stockQuantity,
            availableStock: p.availableStock,
            storeStock: p.storeStock,
            catalogStockQuantity: p.catalogStockQuantity,
            isSaleable: p.isSaleable,
            isActive: p.isActive,
            status: p.status,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error('getCategoryProductsBySlug error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getSubcategoriesByCategorySlug(req, res) {
  try {
    const { slug } = req.params;
    const slugNorm = String(slug || '').trim().toLowerCase();
    const nameFromSlug = slugNorm.replace(/-/g, ' ');
    let category = await Category.findOne({ slug: slugNorm, isActive: true, level: 1 }).lean();
    if (!category) {
      category = await Category.findOne({
        isActive: true,
        level: 1,
        name: new RegExp(`^${escapeRegex(nameFromSlug)}$`, 'i'),
      }).lean();
    }
    if (!category) {
      category = await Category.findOne({
        isActive: true,
        parentId: { $in: [null, undefined] },
        name: new RegExp(`^${escapeRegex(nameFromSlug)}$`, 'i'),
      }).lean();
    }
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    const subcategories = await Category.find({ parentId: category._id, isActive: true }).sort({ order: 1 }).lean();
    const codesBySub = await collectHierarchyCodesForSubcategories(
      subcategories.map((s) => s._id)
    );
    const countEntries = await Promise.all(
      subcategories.map(async (s) => {
        const codes = codesBySub.get(String(s._id)) || [];
        const match = {
          classification: 'Style',
          isActive: true,
          isSaleable: true,
          $or: productTaxonomyOrForSubcategory(s._id, codes),
        };
        const count = await Product.countDocuments(match);
        return [String(s._id), count];
      })
    );
    const countMap = new Map(countEntries);
    const mappedSubs = subcategories.map((s) => {
      const media = enrichCategory(s);
      return {
        _id: String(s._id),
        name: s.name,
        slug: s.slug,
        emoji: s.emoji || '',
        imageUrl: media.imageUrl || '',
        thumbnailUrl: media.thumbnailUrl || '',
        cardImageUrl: media.cardImageUrl || '',
        productCount: countMap.get(String(s._id)) || 0,
      };
    });
    const deduped = filterCatalogLabels(dedupeSubcategoriesByName(mappedSubs));
    // Self-heal DB when re-import left suffix-duplicate L2s (fire-and-forget).
    if (mappedSubs.length > deduped.length) {
      setImmediate(() => {
        const {
          consolidateDuplicateSubcategories,
          deactivateLegacySeedProducts,
        } = require('../utils/categoryTaxonomyCleanup');
        Promise.resolve()
          .then(() => deactivateLegacySeedProducts())
          .then(() => consolidateDuplicateSubcategories({ warnings: [] }))
          .then(async (result) => {
            if (result?.deactivated > 0) {
              try {
                const { invalidateCustomerCatalogCaches } = require('../services/inventoryAvailabilitySync');
                await invalidateCustomerCatalogCaches();
              } catch (_) {
                /* ignore cache errors */
              }
              console.log(
                '[taxonomy] consolidated duplicate subcategories',
                JSON.stringify(result)
              );
            }
          })
          .catch((err) => console.warn('[taxonomy] consolidate failed:', err.message));
      });
    }
    return res.json({
      success: true,
      data: deduped,
    });
  } catch (err) {
    console.error('getSubcategoriesByCategorySlug error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  listCategories,
  getCategoryDetail,
  getCategoryProductsBySlug,
  getSubcategoriesByCategorySlug,
};
