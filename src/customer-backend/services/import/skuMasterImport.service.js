const ExcelJS = require('exceljs');

const { Product } = require('../../models/Product');
const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');
const { Collection } = require('../../models/Collection');
const { HomeSection } = require('../../models/HomeSection');
const { Button } = require('../../models/Button');
const { applySkuRowToProductDoc, rebuildSkuMediaFromRow } = require('./skuMasterProductHydration');

const SKIP_VALUES = new Set(['SKU Code', 'Mandatory', 'Not Null, Unique', 'Not Null', 'varchar(20)', 'varchar(100)']);

function slugify(str) {
  if (!str || typeof str !== 'string') return 'category';
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+/, '').replace(/-+$/, '') || 'category';
}

async function ensureUniqueCategorySlug(baseSlug, excludeId = null, session = null) {
  const base = baseSlug || 'category';
  let candidate = base;
  let n = 0;
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const query = Category.findOne(q).lean();
    if (session) query.session(session);
    // eslint-disable-next-line no-await-in-loop
    const exists = await query;
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
    const text = raw && typeof raw === 'object' && raw.text ? String(raw.text) : raw != null ? String(raw) : '';
    const key = text.trim();
    if (key) map.set(key, colNumber);
  });
  return map;
}

function parseBoolean(raw, fallback = false) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (!t) return fallback;
  if (t === 'TRUE' || t === 'T' || t === 'Y' || t === 'YES' || t === '1') return true;
  if (t === 'FALSE' || t === 'F' || t === 'N' || t === 'NO' || t === '0') return false;
  return fallback;
}

function parseNumberCell(val, fallback = 0) {
  if (val == null || val === '') return fallback;
  const n = Number.parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function parseHierarchyCode(code) {
  const raw = String(code || '').trim();
  const m = /^([A-Za-z])(\d+)$/.exec(raw);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const digitsStr = m[2];
  const width = digitsStr.length;
  const num = Number.parseInt(digitsStr, 10);
  if (!Number.isFinite(num)) return null;
  const pad = (n) => String(n).padStart(width, '0');
  const mainCode = `${letter}${pad(Math.floor(num / 1000) * 1000)}`;
  const subCode = `${letter}${pad(Math.floor(num / 100) * 100)}`;
  return { letter, num, width, mainCode, subCode };
}

async function importSkuMaster(buffer, { overwrite = true } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const counts = {
    products: { created: 0, updated: 0, skipped: 0 },
    categories: { created: 0, updated: 0, skipped: 0 },
    banners: { upserted: 0 },
    collections: { upserted: 0 },
    homeSections: { upserted: 0 },
    buttons: { upserted: 0 },
  };
  const errors = [];
  const warnings = [];

  const runImport = async (session) => {
    // ── SKU Master ──────────────────────────────────────────────────────────
    const skuWs = wb.getWorksheet('SKU Master');
    if (!skuWs) {
      errors.push({ sheet: 'SKU Master', message: 'Sheet "SKU Master" not found' });
    } else {
      const headerMap = makeHeaderIndexMap(skuWs, 1);
      const skuCol = headerMap.get('SKU Code') || headerMap.get('SKU code');
      const nameCol = headerMap.get('SKU Name');

      if (!skuCol || !nameCol) {
        errors.push({ sheet: 'SKU Master', message: 'Missing required columns: "SKU Code" and/or "SKU Name"' });
      } else {
        // Mandatory fields (excluding vendorCode which is always empty in template)
        const mandatory = ['sku', 'name', 'classification', 'hierarchyCode', 'size', 'mrp', 'price', 'baseCost', 'hsnCode'];

        // Dynamically detect first real data row (scan rows 2-20)
        let firstDataRow = 5;
        for (let r = 2; r <= Math.min(20, skuWs.rowCount); r += 1) {
          const probeSku = getCellText(skuWs.getRow(r), skuCol);
          const probeName = getCellText(skuWs.getRow(r), nameCol);
          if (probeSku && probeName && !SKIP_VALUES.has(probeSku) && /^[A-Za-z0-9_-]+$/.test(probeSku)) {
            firstDataRow = r;
            break;
          }
        }

        let productRows = 0;
        let productErrors = 0;

        for (let r = firstDataRow; r <= skuWs.rowCount; r += 1) {
          const row = skuWs.getRow(r);
          const sku = getCellText(row, skuCol);
          const name = getCellText(row, nameCol);

          if (!sku && !name) continue;

          // Category header rows (no SKU, has name)
          if (!sku && name) {
            const categoryName = name.trim();
            try {
              const existingQ = Category.findOne({ name: categoryName }).lean();
              if (session) existingQ.session(session);
              // eslint-disable-next-line no-await-in-loop
              const existing = await existingQ;
              if (existing) {
                counts.categories.skipped += 1;
              } else {
                const slug = await ensureUniqueCategorySlug(slugify(categoryName), null, session);
                const catData = [{ name: categoryName, slug, isActive: true, order: 0, level: 1, parentId: null }];
                // eslint-disable-next-line no-await-in-loop
                if (session) {
                  await Category.create(catData, { session });
                } else {
                  await Category.create(catData);
                }
                counts.categories.created += 1;
              }
            } catch (e) {
              errors.push({ sheet: 'SKU Master', row: r, message: `Category error: ${e.message}` });
            }
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
          if (doc.baseCost == null || Number.isNaN(Number(doc.baseCost))) doc.baseCost = 0;
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
            // Per-row data-quality skip: surface as warning, but still count it
            // toward the safety threshold below so a wholly-broken sheet aborts.
            warnings.push({ sheet: 'SKU Master', row: r, sku, message: `Skipped: missing mandatory field "${missingField}"` });
            counts.products.skipped += 1;
            productErrors += 1;
            continue;
          }

          // Resolve categoryId from hierarchyCode
          if (doc.hierarchyCode && !doc.categoryId) {
            try {
              const hc = parseHierarchyCode(String(doc.hierarchyCode || '').trim());
              if (hc) {
                const subQ = Category.findOne({ hierarchyCodes: hc.subCode, level: 2 }).select('_id parentId').lean();
                if (session) subQ.session(session);
                // eslint-disable-next-line no-await-in-loop
                const subDoc = await subQ;
                if (subDoc?.parentId) {
                  doc.categoryId = subDoc.parentId;
                  doc.subcategoryId = subDoc._id;
                } else {
                  const mainQ = Category.findOne({ hierarchyCodes: hc.mainCode, level: 1 }).select('_id').lean();
                  if (session) mainQ.session(session);
                  // eslint-disable-next-line no-await-in-loop
                  const mainDoc = await mainQ;
                  if (mainDoc?._id) doc.categoryId = mainDoc._id;
                }
              }
            } catch (_) {
              // non-fatal
            }
          }

          if (!doc.imageUrl) {
            warnings.push({ row: r, sku, message: 'Missing imageUrl' });
          }

          if (doc.price === 0) {
            doc.isActive = false;
            doc.status = 'inactive';
          } else {
            doc.isActive = true;
            doc.status = 'active';
          }

          const existingQ = Product.findOne({ sku: doc.sku }).lean();
          if (session) existingQ.session(session);
          // eslint-disable-next-line no-await-in-loop
          const existing = await existingQ;
          if (existing) {
            if (!overwrite) {
              counts.products.skipped += 1;
              continue;
            }
            const updateDoc = { ...doc };
            delete updateDoc.sku;
            const updateQ = Product.updateOne({ _id: existing._id }, { $set: updateDoc, $unset: { importRaw: 1, mastersheetFields: 1 } });
            if (session) updateQ.session(session);
            // eslint-disable-next-line no-await-in-loop
            await updateQ;
            counts.products.updated += 1;
          } else {
            const createData = [doc];
            // eslint-disable-next-line no-await-in-loop
            if (session) {
              await Product.create(createData, { session });
            } else {
              await Product.create(createData);
            }
            counts.products.created += 1;
          }
        }

        if (productRows > 0 && (productErrors / productRows) > 0.2) {
          throw new Error(`Import aborted: error ratio exceeded 20% (${productErrors}/${productRows})`);
        }
      }
    }

    // ── Categories ──────────────────────────────────────────────────────────
    const catsWs = wb.getWorksheet('Categories');
    if (catsWs) {
      const headerMap = makeHeaderIndexMap(catsWs, 1);
      const mainCol = headerMap.get('Main Category') || headerMap.get('Main Category 2') || headerMap.get('Category');
      const subCol = headerMap.get('Sub Category') || headerMap.get('Sub-Category') || headerMap.get('Subcategory') || headerMap.get('Sub Category 3') || headerMap.get('Sub-Sub Category 1');

      for (let r = 2; r <= catsWs.rowCount; r += 1) {
        const row = catsWs.getRow(r);
        const mainName = mainCol ? getCellText(row, mainCol) : '';
        const subName = subCol ? getCellText(row, subCol) : '';
        const name = subName || mainName;
        if (!name) continue;

        try {
          const isSubCat = Boolean(subName && mainName);
          let parentId = null;

          if (isSubCat) {
            const parentQ = Category.findOne({ name: mainName, level: 1 }).select('_id').lean();
            if (session) parentQ.session(session);
            // eslint-disable-next-line no-await-in-loop
            const parentDoc = await parentQ;
            parentId = parentDoc?._id || null;

            if (!parentDoc) {
              const slug = await ensureUniqueCategorySlug(slugify(mainName), null, session);
              const catData = [{ name: mainName, slug, isActive: true, order: 0, level: 1, parentId: null }];
              // eslint-disable-next-line no-await-in-loop
              const created = session ? await Category.create(catData, { session }) : await Category.create(catData);
              parentId = created[0]._id;
              counts.categories.created += 1;
            }
          }

          const existingQ = Category.findOne({ name, parentId: parentId || null }).lean();
          if (session) existingQ.session(session);
          // eslint-disable-next-line no-await-in-loop
          const existing = await existingQ;

          if (existing) {
            const updateQ = Category.findByIdAndUpdate(existing._id, { $set: { name, isActive: true, ...(parentId ? { parentId, level: 2 } : { level: 1 }) } });
            if (session) updateQ.session(session);
            // eslint-disable-next-line no-await-in-loop
            await updateQ;
            counts.categories.updated += 1;
          } else {
            const slug = await ensureUniqueCategorySlug(slugify(name), null, session);
            const level = parentId ? 2 : 1;
            const catData = [{ name, slug, isActive: true, order: 0, level, parentId: parentId || null }];
            // eslint-disable-next-line no-await-in-loop
            if (session) {
              await Category.create(catData, { session });
            } else {
              await Category.create(catData);
            }
            counts.categories.created += 1;
          }
        } catch (e) {
          errors.push({ sheet: 'Categories', row: r, message: e.message });
        }
      }
    }

    // ── Category Display Images ─────────────────────────────────────────────
    const cdWs = wb.getWorksheet('Category Display Image') || wb.getWorksheet('Catogory display Image');
    if (cdWs) {
      const headerMap = makeHeaderIndexMap(cdWs, 1);
      const nameCol = headerMap.get('Category Name');
      const urlCol = headerMap.get('Category URL') || headerMap.get('Display Image URL') || headerMap.get('Image URL');
      let updated = 0;
      if (nameCol && urlCol) {
        for (let r = 2; r <= cdWs.rowCount; r += 1) {
          const row = cdWs.getRow(r);
          const name = getCellText(row, nameCol);
          const imageUrl = getCellText(row, urlCol);
          if (!name || !imageUrl) continue;
          try {
            const updateQ = Category.findOneAndUpdate({ name }, { $set: { imageUrl } }, { upsert: false });
            if (session) updateQ.session(session);
            // eslint-disable-next-line no-await-in-loop
            await updateQ;
            updated += 1;
          } catch (e) {
            errors.push({ sheet: 'Category Display Image', row: r, message: e.message });
          }
        }
      }
      counts['Category Display Image'] = updated;
    }

    // ── Banner Details ──────────────────────────────────────────────────────
    const bannerWs = wb.getWorksheet('Banner Details') || wb.getWorksheet('Banner');
    if (bannerWs) {
      const headerMap = makeHeaderIndexMap(bannerWs, 1);
      const bannerIdCol = headerMap.get('Banner ID') || headerMap.get('BannerID') || headerMap.get('bannerId');
      const titleCol = headerMap.get('Title') || headerMap.get('title') || headerMap.get('Banner Title');
      const imageUrlCol = headerMap.get('Image URL') || headerMap.get('imageUrl') || headerMap.get('Banner Image URL') || headerMap.get('Image');
      const isActiveCol = headerMap.get('Is Active') || headerMap.get('isActive') || headerMap.get('Active');
      const orderCol = headerMap.get('Order') || headerMap.get('order');

      let upserted = 0;
      for (let r = 2; r <= bannerWs.rowCount; r += 1) {
        const row = bannerWs.getRow(r);
        const bannerId = bannerIdCol ? getCellText(row, bannerIdCol) : '';
        const title = titleCol ? getCellText(row, titleCol) : '';
        const imageUrl = imageUrlCol ? getCellText(row, imageUrlCol) : '';
        const isActive = isActiveCol ? parseBoolean(getCellText(row, isActiveCol), true) : true;
        const order = orderCol ? parseNumberCell(getCellText(row, orderCol), r - 2) : r - 2;

        if (!imageUrl && !title && !bannerId) continue;

        try {
          const filter = bannerId ? { bannerId } : { order };
          const updateData = { title: title || '', imageUrl: imageUrl || '', isActive, order, ...(bannerId ? { bannerId } : {}) };
          const updateQ = Banner.findOneAndUpdate(filter, { $set: updateData }, { upsert: true, new: false });
          if (session) updateQ.session(session);
          // eslint-disable-next-line no-await-in-loop
          await updateQ;
          upserted += 1;
        } catch (e) {
          errors.push({ sheet: 'Banner Details', row: r, message: e.message });
        }
      }
      counts.banners.upserted = upserted;
    }

    // ── Home Page Content ───────────────────────────────────────────────────
    const homeWs = wb.getWorksheet('Home Page Content') || wb.getWorksheet('Home Content');
    if (homeWs) {
      const headerMap = makeHeaderIndexMap(homeWs, 1);
      const sectionKeyCol = headerMap.get('Section Key') || headerMap.get('sectionKey') || headerMap.get('Key');
      const sectionNameCol = headerMap.get('Section Name') || headerMap.get('Name') || headerMap.get('Title');
      const orderCol = headerMap.get('Order') || headerMap.get('order');
      const isActiveCol = headerMap.get('Is Active') || headerMap.get('isActive');

      let upserted = 0;
      for (let r = 2; r <= homeWs.rowCount; r += 1) {
        const row = homeWs.getRow(r);
        const rawKey = sectionKeyCol ? getCellText(row, sectionKeyCol) : '';
        const name = sectionNameCol ? getCellText(row, sectionNameCol) : '';
        if (!rawKey && !name) continue;

        const sectionKey = rawKey ? rawKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : slugify(name).replace(/-/g, '_');
        if (!sectionKey) continue;

        const order = orderCol ? parseNumberCell(getCellText(row, orderCol), r - 2) : r - 2;
        const isActive = isActiveCol ? parseBoolean(getCellText(row, isActiveCol), true) : true;

        try {
          const updateData = { title: name || sectionKey, order, isActive };
          const updateQ = HomeSection.findOneAndUpdate({ sectionKey }, { $set: updateData }, { upsert: true, new: false });
          if (session) updateQ.session(session);
          // eslint-disable-next-line no-await-in-loop
          await updateQ;
          upserted += 1;
        } catch (e) {
          errors.push({ sheet: 'Home Page Content', row: r, message: e.message });
        }
      }
      counts.homeSections.upserted = upserted;
    }

    // ── Collections ─────────────────────────────────────────────────────────
    const collWs = wb.getWorksheet('Collections') || wb.getWorksheet('Collection');
    if (collWs) {
      const headerMap = makeHeaderIndexMap(collWs, 1);
      const nameCol = headerMap.get('Collection Name') || headerMap.get('Name') || headerMap.get('name');
      const slugCol = headerMap.get('Slug') || headerMap.get('slug');

      let upserted = 0;
      for (let r = 2; r <= collWs.rowCount; r += 1) {
        const row = collWs.getRow(r);
        const name = nameCol ? getCellText(row, nameCol) : '';
        if (!name) continue;

        const rawSlug = slugCol ? getCellText(row, slugCol) : '';
        const collSlug = rawSlug || slugify(name);

        try {
          const filter = { slug: collSlug };
          const updateData = { name: name || collSlug, slug: collSlug };
          const updateQ = Collection.findOneAndUpdate(filter, { $set: updateData }, { upsert: true, new: false });
          if (session) updateQ.session(session);
          // eslint-disable-next-line no-await-in-loop
          await updateQ;
          upserted += 1;
        } catch (e) {
          errors.push({ sheet: 'Collections', row: r, message: e.message });
        }
      }
      counts.collections.upserted = upserted;
    }

    // ── Button ──────────────────────────────────────────────────────────────
    const btnWs = wb.getWorksheet('Button') || wb.getWorksheet('Buttons');
    if (btnWs) {
      const headerMap = makeHeaderIndexMap(btnWs, 1);
      const nameCol = headerMap.get('Button Name') || headerMap.get('Name') || headerMap.get('name');
      const labelCol = headerMap.get('Label') || headerMap.get('label');
      const isActiveCol = headerMap.get('Is Active') || headerMap.get('isActive');
      const orderCol = headerMap.get('Order') || headerMap.get('order');

      let upserted = 0;
      for (let r = 2; r <= btnWs.rowCount; r += 1) {
        const row = btnWs.getRow(r);
        const name = nameCol ? getCellText(row, nameCol) : '';
        if (!name) continue;

        const label = labelCol ? getCellText(row, labelCol) : name;
        const isActive = isActiveCol ? parseBoolean(getCellText(row, isActiveCol), true) : true;
        const order = orderCol ? parseNumberCell(getCellText(row, orderCol), r - 2) : r - 2;

        try {
          const filter = { name };
          const updateData = { name, label: label || name, isActive, order };
          const updateQ = Button.findOneAndUpdate(filter, { $set: updateData }, { upsert: true, new: false });
          if (session) updateQ.session(session);
          // eslint-disable-next-line no-await-in-loop
          await updateQ;
          upserted += 1;
        } catch (e) {
          errors.push({ sheet: 'Button', row: r, message: e.message });
        }
      }
      counts.buttons.upserted = upserted;
    }
  };

  // Bulk Excel imports must not run inside a single multi-document transaction: large sheets exceed
  // default transaction time/size limits, trigger a full retry without txn (2× wall time + dirty
  // in-memory counts), and leave the HTTP request open far longer. Per-row upserts are sufficient here.
  await runImport(null);

  return { counts, warnings, errors, success: errors.length === 0 };
}

module.exports = { importSkuMaster };
