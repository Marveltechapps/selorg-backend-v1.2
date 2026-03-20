const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const { Product } = require('../../models/Product');
const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');

const SKIP_VALUES = new Set([
  'SKU Code',
  'Mandatory',
  'Not Null, Unique',
  'Not Null',
  'varchar(20)',
  'varchar(100)',
]);

function parsePrice(val) {
  if (val == null) return null;
  const str = String(val).replace(/Rs\.?\s*/gi, '').replace(/[^\d.]/g, '');
  const n = Number.parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function parseBooleanYN(val, fallback = false) {
  const t = String(val || '').trim().toUpperCase();
  if (!t) return fallback;
  return t === 'Y';
}

function normalizeClassification(val) {
  const t = String(val || '').trim();
  if (!t) return 'Style';
  if (t.toLowerCase() === 'varient') return 'Variant';
  if (t.toLowerCase() === 'variant') return 'Variant';
  return t;
}

function splitDescription(val) {
  const raw = String(val || '').trim();
  if (!raw) {
    return {
      about: '',
      nutrition: '',
      originOfPlace: '',
      healthBenefits: '',
      raw: '',
    };
  }
  const patterns = [
    { key: 'about', prefix: 'About - ' },
    { key: 'nutrition', prefix: 'Nutrition - ' },
    { key: 'originOfPlace', prefix: 'Origin of Place - ' },
    { key: 'healthBenefits', prefix: 'Health Benefits - ' },
  ];
  const out = { about: '', nutrition: '', originOfPlace: '', healthBenefits: '', raw };
  for (let i = 0; i < patterns.length; i += 1) {
    const current = patterns[i];
    const start = raw.indexOf(current.prefix);
    if (start === -1) continue;
    let end = raw.length;
    for (let j = i + 1; j < patterns.length; j += 1) {
      const nextPos = raw.indexOf(patterns[j].prefix, start + current.prefix.length);
      if (nextPos !== -1) {
        end = Math.min(end, nextPos);
      }
    }
    out[current.key] = raw.slice(start + current.prefix.length, end).trim();
  }
  if (!out.about && !out.nutrition && !out.originOfPlace && !out.healthBenefits) {
    out.about = raw;
  }
  return out;
}

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
    const classificationCol = headerMap.get('SKU Classification (col C)') ?? headerMap.get('SKU Classification') ?? 3;
    const tagCol = headerMap.get('SKU Tag') ?? headerMap.get('Tag') ?? 4;
    const hierarchyCodeCol = headerMap.get('Category hierarchy code') ?? headerMap.get('Hierarchy Code') ?? 14;
    const vendorCodeCol = headerMap.get('Primary Vendor') ?? headerMap.get('Vendor Code') ?? 16;
    const mfgSkuCodeCol = headerMap.get('Mfg SKU code') ?? headerMap.get('Mfg SKU Code') ?? 15;
    const countryCol = headerMap.get('Country of Origin') ?? 13;
    const sizeCol = headerMap.get('SKU Size') ?? headerMap.get('Size') ?? 9;
    const uomCol = headerMap.get('SKU UOM') ?? 89;
    const salePriceCol = headerMap.get('Sale Price') ?? headerMap.get('Sale Price ');
    const mrpCol = headerMap.get('MSRP/MRP') ?? headerMap.get('MRP') ?? headerMap.get('MSRP');
    const baseCostCol = headerMap.get('Base Cost') ?? 23;
    const hsnCol = headerMap.get('Tax Category') ?? headerMap.get('HSN Code') ?? 24;
    const taxPercentCol = headerMap.get('TaxPercent') ?? headerMap.get('Tax Percent') ?? 90;
    const imageUrlCol = headerMap.get('SKUimgURL') ?? headerMap.get('SKUimgURL ');
    const imageCols = [66, 68, 70, 72, 74, 76];
    const detailsCol = headerMap.get('Product Details') ?? 41;
    const metaTitleCol = headerMap.get('Meta Title') ?? 47;
    const metaKeywordsCol = headerMap.get('Meta Keyword') ?? 48;
    const metaDescriptionCol = headerMap.get('Meta Description') ?? 49;
    const shelfLifeValueCol = headerMap.get('Shelf Life Value') ?? 51;
    const shelfLifeTypeCol = headerMap.get('Shelf life Type') ?? 52;
    const shelfLifeTotalCol = headerMap.get('Total shelf Life') ?? 53;
    const shelfLifeReceivingCol = headerMap.get('Shelf Life on Receiving') ?? 54;
    const shelfLifePickingCol = headerMap.get('Shelf life on Picking') ?? 55;
    const storeLinksCol = headerMap.get('Store Links') ?? 25;
    const udfStart = 31; // AE
    const boolCols = {
      qcRequired: 18,
      backOrderAllowed: 19,
      isPurchasable: 60,
      isSaleable: 61,
      isStocked: 62,
      serialTracking: 56,
      stackable: 57,
      hazardous: 58,
      poisonous: 59,
    };

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

      let classification = normalizeClassification(getCellText(row, classificationCol));
      if (classification !== 'Style' && classification !== 'Variant') classification = 'Style';

      let price = salePriceCol ? parsePrice(getCellText(row, salePriceCol)) : null;
      let mrp = mrpCol ? parsePrice(getCellText(row, mrpCol)) : null;
      const baseCost = baseCostCol ? parsePrice(getCellText(row, baseCostCol)) : null;
      const hsnCode = String(getCellText(row, hsnCol) || '').replace(/^'/, '');
      const taxPercent = parseFloat(String(getCellText(row, taxPercentCol) || '0').replace('%', '')) || 0;
      const imageUrl = imageUrlCol ? getCellText(row, imageUrlCol) : '';
      const additionalImages = imageCols.map((c) => getCellText(row, c)).filter(Boolean);

      if (mrp != null && price != null && mrp < price) {
        mrp = price;
        warnings.push({ row: r, sku, message: 'MRP was lower than price, adjusted to match sale price' });
      }
      if (price == null) price = 0;
      if (mrp == null) mrp = 0;

      const doc = {
        sku,
        name,
        classification,
        tag: getCellText(row, tagCol),
        hierarchyCode: getCellText(row, hierarchyCodeCol),
        mfgSkuCode: getCellText(row, mfgSkuCodeCol),
        vendorCode: getCellText(row, vendorCodeCol),
        countryOfOrigin: getCellText(row, countryCol) || 'India',
        size: getCellText(row, sizeCol),
        quantity: getCellText(row, sizeCol),
        uom: getCellText(row, uomCol) || 'EACH',
        price,
        mrp,
        originalPrice: mrp,
        baseCost,
        costPrice: baseCost || 0,
        hsnCode,
        taxPercent,
        gstRate: taxPercent,
        imageUrl,
        images: [imageUrl, ...additionalImages].filter(Boolean),
        additionalImages,
        description: splitDescription(getCellText(row, detailsCol)),
        meta: {
          title: getCellText(row, metaTitleCol),
          keywords: getCellText(row, metaKeywordsCol),
          description: getCellText(row, metaDescriptionCol),
        },
        shelfLife: {
          value: parseFloat(getCellText(row, shelfLifeValueCol)) || 0,
          type: getCellText(row, shelfLifeTypeCol),
          total: parseFloat(getCellText(row, shelfLifeTotalCol)) || 0,
          onReceiving: parseFloat(getCellText(row, shelfLifeReceivingCol)) || 0,
          onPicking: parseFloat(getCellText(row, shelfLifePickingCol)) || 0,
        },
        storeLinks: getCellText(row, storeLinksCol),
        qcRequired: parseBooleanYN(getCellText(row, boolCols.qcRequired), false),
        backOrderAllowed: parseBooleanYN(getCellText(row, boolCols.backOrderAllowed), false),
        isPurchasable: parseBooleanYN(getCellText(row, boolCols.isPurchasable), true),
        isSaleable: parseBooleanYN(getCellText(row, boolCols.isSaleable), true),
        isStocked: parseBooleanYN(getCellText(row, boolCols.isStocked), true),
        serialTracking: parseBooleanYN(getCellText(row, boolCols.serialTracking), false),
        stackable: parseBooleanYN(getCellText(row, boolCols.stackable), false),
        hazardous: parseBooleanYN(getCellText(row, boolCols.hazardous), false),
        poisonous: parseBooleanYN(getCellText(row, boolCols.poisonous), false),
        udf: {
          udf1: getCellText(row, udfStart + 0),
          udf2: getCellText(row, udfStart + 1),
          udf3: getCellText(row, udfStart + 2),
          udf4: getCellText(row, udfStart + 3),
          udf5: getCellText(row, udfStart + 4),
          udf6: getCellText(row, udfStart + 5),
          udf7: getCellText(row, udfStart + 6),
          udf8: getCellText(row, udfStart + 7),
          udf9: getCellText(row, udfStart + 8),
          udf10: getCellText(row, udfStart + 9),
        },
      };

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
              $setOnInsert: {},
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

