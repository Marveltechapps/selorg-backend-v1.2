const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const { Product } = require('../../models/Product');
const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');
const { applySkuRowToProductDoc, rebuildSkuMediaFromRow } = require('./skuMasterProductHydration');

const SKIP_VALUES = new Set([
  'SKU Code',
  'Mandatory',
  'Not Null, Unique',
  'Not Null',
  'varchar(20)',
  'varchar(100)',
]);

function slugify(str) {
  if (!str || typeof str !== 'string') return 'category';
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || 'category'
  );
}

async function ensureUniqueCategorySlug(baseSlug, excludeId = null) {
  const base = baseSlug || 'category';
  let candidate = base;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    // eslint-disable-next-line no-await-in-loop
    const exists = await Category.findOne(q).lean();
    if (!exists) return candidate;
    candidate = `${base}-${++n}`;
  }
}

function getCellText(row, colIndex1Based) {
  const cell = row.getCell(colIndex1Based);
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  return String(v).trim();
}

function makeHeaderIndexMap(worksheet, headerRowNumber = 1) {
  const headerRow = worksheet.getRow(headerRowNumber);
  const map = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const raw = cell?.value;
    const text =
      raw && typeof raw === 'object' && raw.text ? String(raw.text) : raw != null ? String(raw) : '';
    const key = text.trim();
    if (key) map.set(key, colNumber);
  });
  return map;
}

async function importSkuMaster(buffer, { overwrite = true } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const counts = {
    products: { created: 0, updated: 0, skipped: 0 },
    categories: { created: 0, skipped: 0 },
  };
  const errors = [];
  const warnings = [];
  let productRows = 0;
  let productErrors = 0;
  const mandatory = ['sku', 'name', 'classification', 'hierarchyCode', 'size', 'mrp', 'price', 'baseCost', 'hsnCode', 'vendorCode'];
  const productOps = [];
  const categoryOps = [];

  // SKU Master
  try {
    const ws = wb.getWorksheet('SKU Master');
    if (!ws) throw new Error('Sheet "SKU Master" not found');

    const headerMap = makeHeaderIndexMap(ws, 1);
    const skuCol = headerMap.get('SKU Code') || headerMap.get('SKU code');
    const nameCol = headerMap.get('SKU Name') ?? headerMap.get('SKU Name ');

    if (!skuCol || !nameCol) {
      throw new Error('Missing required columns: "SKU Code" and/or "SKU Name"');
    }

    // Row 1..5 are header metadata; data starts at row 6
    for (let r = 6; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const sku = getCellText(row, skuCol);

      const name = getCellText(row, nameCol);
      if (!sku && !name) {
        // Completely empty line
        continue;
      }

      // Category header rows: SKU empty but name present
      if (!sku && name) {
        const categoryName = name.trim();
        categoryOps.push(async (session) => {
          const exists = await Category.findOne({ name: categoryName }).session(session).lean();
          if (exists) {
            counts.categories.skipped += 1;
            return;
          }
          const slug = await ensureUniqueCategorySlug(slugify(categoryName));
          await Category.create([{ name: categoryName, slug, isActive: true, order: 0, level: 1, parentId: null }], { session });
          counts.categories.created += 1;
        });
        continue;
      }

      productRows += 1;
      if (SKIP_VALUES.has(sku)) {
        counts.products.skipped += 1;
        continue;
      }

      const doc = {};
      applySkuRowToProductDoc(doc, row, headerMap, { getCellText });
      rebuildSkuMediaFromRow(doc, row, headerMap, getCellText);
      doc.sku = sku;
      doc.name = name;
      if (!doc.classification || (doc.classification !== 'Style' && doc.classification !== 'Variant')) {
        doc.classification = 'Style';
      }
      doc.price = doc.price == null || Number.isNaN(Number(doc.price)) ? 0 : Number(doc.price);
      doc.mrp = doc.mrp == null || Number.isNaN(Number(doc.mrp)) ? 0 : Number(doc.mrp);
      if (doc.baseCost == null || Number.isNaN(Number(doc.baseCost))) {
        doc.baseCost = 0;
      }
      if (doc.mrp < doc.price) {
        doc.mrp = doc.price;
        warnings.push({ row: r, sku, message: 'MRP was lower than price, adjusted to match sale price' });
      }
      doc.originalPrice = doc.mrp;
      doc.costPrice = doc.baseCost || 0;

      const missingField = mandatory.find((k) => {
        const val = doc[k];
        return val === undefined || val === null || String(val).trim() === '';
      });
      if (missingField) {
        errors.push({ row: r, sku, message: `Missing mandatory field: ${missingField}` });
        productErrors += 1;
        continue;
      }

      if (!doc.imageUrl) {
        errors.push({ row: r, sku, message: 'Missing imageUrl' });
        productErrors += 1;
        continue;
      }
      if (doc.price === 0) {
        doc.isActive = false;
        doc.status = 'inactive';
      } else {
        doc.isActive = true;
        doc.status = 'active';
      }

      productOps.push(async (session) => {
        const existing = await Product.findOne({ sku: doc.sku }).session(session).lean();
        if (existing) {
          if (!overwrite) {
            counts.products.skipped += 1;
            return;
          }
          const updateDoc = { ...doc };
          delete updateDoc.sku;
          await Product.updateOne(
            { _id: existing._id },
            {
              $set: updateDoc,
              $unset: { importRaw: 1, mastersheetFields: 1 },
            },
            { session }
          );
          counts.products.updated += 1;
        } else {
          await Product.create([doc], { session });
          counts.products.created += 1;
        }
      });
    }

    if (productRows > 0 && (productErrors / productRows) > 0.2) {
      throw new Error(`Import aborted: error ratio exceeded 20% (${productErrors}/${productRows})`);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const runCategoryOp of categoryOps) {
          // eslint-disable-next-line no-await-in-loop
          await runCategoryOp(session);
        }
        for (const runProductOp of productOps) {
          // eslint-disable-next-line no-await-in-loop
          await runProductOp(session);
        }
      });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    errors.push({ sheet: 'SKU Master', message: err.message });
  }

  // Categories
  try {
    const ws = wb.getWorksheet('Categories');
    if (ws) {
      const headerMap = makeHeaderIndexMap(ws, 1);
      const mainCatCol = headerMap.get('Main Category 2') ?? headerMap.get('Main Category');
      const subCatCol =
        headerMap.get('Sub-Sub Category 1') ?? headerMap.get('Sub Category 3') ?? headerMap.get('Sub Category');

      let upserts = 0;
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const name = (subCatCol ? getCellText(row, subCatCol) : '') || (mainCatCol ? getCellText(row, mainCatCol) : '');
        if (!name) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          const existing = await Category.findOne({ name }).lean();
          if (existing) {
            // eslint-disable-next-line no-await-in-loop
            await Category.findByIdAndUpdate(existing._id, { $set: { name } }, { new: false });
          } else {
            const slug = await ensureUniqueCategorySlug(slugify(name));
            // eslint-disable-next-line no-await-in-loop
            await Category.create({ name, slug, isActive: true, order: 0, description: '' });
          }
          upserts += 1;
        } catch (e) {
          errors.push({ sheet: 'Categories', row: r, message: e.message });
        }
      }
      counts.Categories = upserts;
    }
  } catch (err) {
    errors.push({ sheet: 'Categories', message: err.message });
  }

  // Category display images (note: mastersheet typo preserved)
  try {
    const ws = wb.getWorksheet('Catogory display Image');
    if (ws) {
      const headerMap = makeHeaderIndexMap(ws, 1);
      const nameCol = headerMap.get('Category Name');
      const urlCol = headerMap.get('Category URL');
      let updated = 0;
      if (nameCol && urlCol) {
        for (let r = 2; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const name = getCellText(row, nameCol);
          const imageUrl = getCellText(row, urlCol);
          if (!name || !imageUrl) continue;
          try {
            // eslint-disable-next-line no-await-in-loop
            await Category.findOneAndUpdate(
              { name },
              { $set: { imageUrl } },
              { upsert: false, new: false }
            );
            updated += 1;
          } catch (e) {
            errors.push({ sheet: 'Catogory display Image', row: r, message: e.message });
          }
        }
      }
      counts['Catogory display Image'] = updated;
    }
  } catch (err) {
    errors.push({ sheet: 'Catogory display Image', message: err.message });
  }

  // Banner sheet (URLs only)
  try {
    const ws = wb.getWorksheet('Banner');
    if (ws) {
      let upserts = 0;
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const url = getCellText(row, 1);
        if (!url) continue;
        const order = r - 2;
        try {
          // eslint-disable-next-line no-await-in-loop
          await Banner.findOneAndUpdate(
            { slot: 'hero', order },
            { $set: { slot: 'hero', order, imageUrl: url, isActive: true } },
            { upsert: true, new: false }
          );
          upserts += 1;
        } catch (e) {
          errors.push({ sheet: 'Banner', row: r, message: e.message });
        }
      }
      counts.Banner = upserts;
    }
  } catch (err) {
    errors.push({ sheet: 'Banner', message: err.message });
  }

  return {
    counts,
    warnings,
    errors,
    success: errors.length === 0,
  };
}

module.exports = { importSkuMaster };

