const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const { Category } = require('../../models/Category');
const { Product } = require('../../models/Product');
const { Banner } = require('../../models/Banner');
const { applySkuRowToProductDoc, rebuildSkuMediaFromRow } = require('./skuMasterProductHydration');

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

function normalizeHeaderKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
}

function parseBoolean(raw, fallback = false) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (!t) return fallback;
  if (t === 'TRUE' || t === 'T' || t === 'Y' || t === 'YES' || t === '1') return true;
  if (t === 'FALSE' || t === 'F' || t === 'N' || t === 'NO' || t === '0') return false;
  return fallback;
}

function parsePrice(val) {
  if (val == null) return null;
  const str = String(val).replace(/Rs\.?\s*/gi, '').replace(/[^\d.]/g, '');
  const n = Number.parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function parseNumberCell(val, fallback = 0) {
  if (val == null || val === '') return fallback;
  const n = Number.parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
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

function findHeaderCol(headerMap, aliases = []) {
  for (const alias of aliases) {
    if (headerMap.has(alias)) return headerMap.get(alias);
  }
  const normalizedAliases = aliases.map((a) => normalizeHeaderKey(a));
  for (const [key, col] of headerMap.entries()) {
    if (normalizedAliases.includes(normalizeHeaderKey(key))) return col;
  }
  return null;
}

function rowToRawObject(row, headerMap) {
  const out = {};
  for (const [header, col] of headerMap.entries()) {
    const v = row.getCell(col)?.value;
    if (v == null) out[header] = null;
    else if (typeof v === 'object' && v.text != null) out[header] = String(v.text);
    else if (v instanceof Date) out[header] = v.toISOString();
    else out[header] = String(v);
  }
  return out;
}

async function ensureUniqueCategorySlug(baseSlug, excludeId = null, session = null) {
  const base = baseSlug || 'category';
  let candidate = base;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    // eslint-disable-next-line no-await-in-loop
    const exists = await Category.findOne(q).session(session).lean();
    if (!exists) return candidate;
    candidate = `${base}-${++n}`;
  }
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

function parseDateCell(cellValue) {
  if (!cellValue) return undefined;
  if (cellValue instanceof Date) return cellValue;
  // ExcelJS often returns string YYYY-MM-DD for text cells
  const s = String(cellValue).trim();
  if (!s) return undefined;
  // Try YYYY-MM-DD first
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
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

function normalizeForMatch(str) {
  const s = String(str || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[-—–]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
  // Mastersheets sometimes contain spelling variants like "raagi" vs "ragi".
  // Collapsing repeated letters makes matching more robust without heavy fuzzy logic.
  return s.trim().replace(/([a-z])\1+/g, '$1');
}

function getSkuBaseName(skuName) {
  const raw = String(skuName || '').trim();
  if (!raw) return '';
  // Common pattern in mastersheet: "<name> - <weight>"
  const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  const parts2 = raw.split('—').map((p) => p.trim()).filter(Boolean);
  if (parts2.length >= 2) return parts2[0];
  return raw;
}

function expandCodeRange(codeRef) {
  // Supports: "A101–A124" / "A101-A124"
  const refs = (String(codeRef || '').match(/[A-Za-z]\d+/g) || []).map((s) => s.trim());
  if (refs.length === 0) return [];
  if (refs.length === 1) return [refs[0]];
  const start = parseHierarchyCode(refs[0]);
  const end = parseHierarchyCode(refs[1]);
  if (!start || !end) return refs;
  if (start.letter !== end.letter) return refs;
  const out = [];
  const step = start.num <= end.num ? 1 : -1;
  for (let n = start.num; step > 0 ? n <= end.num : n >= end.num; n += step) {
    out.push(`${start.letter}${String(n).padStart(start.width, '0')}`);
    if (out.length > 5000) break; // safety guard
  }
  return out;
}

function mapBannerContentType(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const allowed = new Set(['banner', 'video', 'image', 'text', 'products']);
  if (allowed.has(t)) return t;
  // aliases sometimes used by templates
  if (t === 'productCarousel') return 'products';
  if (t === 'bannerImage' || t === 'promoImage') return 'image';
  return t;
}

async function importContentHubMaster(buffer, { overwrite = true } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const counts = {
    categories: { created: 0, updated: 0, skipped: 0 },
    products: { created: 0, updated: 0, skipped: 0, unmatched: 0 },
    banners: { upserted: 0 },
    images: { updated: 0 },
  };

  const errors = [];
  const warnings = [];

  const session = await mongoose.startSession();
  const run = async () => {
      // -------------------------
      // 1) Categories hierarchy
      // -------------------------
      const catsWs = wb.getWorksheet('Categories');
      if (!catsWs) {
        errors.push({ sheet: 'Categories', message: 'Sheet "Categories" not found' });
      } else {
        const headerMap = makeHeaderIndexMap(catsWs, 1);
        const entries = [];

        const mainCol =
          [...headerMap.keys()].find((k) => {
            const nk = normalizeHeaderKey(k);
            return nk === 'main category' || nk === 'category' || nk === 'category ';
          }) ?? null;

        const subCol =
          [...headerMap.keys()].find((k) => {
            const nk = normalizeHeaderKey(k);
            return nk === 'sub category' || nk === 'subcategory' || nk === 'sub category ';
          }) ?? null;

        const productCol =
          [...headerMap.keys()].find((k) => {
            const nk = normalizeHeaderKey(k);
            return (
              nk === 'products' ||
              nk === 'product sub-sub category 1' ||
              nk === 'product sub-sub category' ||
              nk.includes('product') && nk.includes('sub') && nk.includes('category')
            );
          }) ?? null;

        const hierarchyCodeCol =
          [...headerMap.keys()].find((k) => {
            const nk = normalizeHeaderKey(k);
            return nk === 'hierarchy code' || nk === 'hierarchy code ref' || nk.includes('hierarchy code');
          }) ?? null;

        if (!mainCol || !subCol || !productCol || !hierarchyCodeCol) {
          errors.push({
            sheet: 'Categories',
            message: `Missing required headers. Found: ${[...headerMap.keys()].join(', ')}`,
          });
        } else {
          for (let r = 2; r <= catsWs.rowCount; r += 1) {
            const row = catsWs.getRow(r);
            const mainName = getCellText(row, headerMap.get(mainCol));
            const subName = getCellText(row, headerMap.get(subCol));
            const productName = getCellText(row, headerMap.get(productCol));
            const code = getCellText(row, headerMap.get(hierarchyCodeCol));

            if (!code && !mainName && !subName && !productName) continue;

            let level = null;
            let name = '';
            if (mainName) {
              level = 1;
              name = mainName;
            } else if (subName) {
              level = 2;
              name = subName;
            } else if (productName) {
              level = 3;
              name = productName;
            } else {
              continue;
            }

            if (!code) {
              warnings.push({ sheet: 'Categories', row: r, message: `Missing hierarchy code for "${name}"` });
              continue;
            }

            entries.push({ level, name, code, row: r, raw: rowToRawObject(row, headerMap) });
          }

          const mainByCode = new Map();
          const subByCode = new Map();
          const productByCode = new Map();
          const productNameToParent = new Map(); // normalized productName -> { categoryId, subcategoryId }

          const uniqueMain = new Map(); // code -> entry
          const uniqueSub = new Map();
          const uniqueProduct = new Map();
          for (const e of entries) {
            if (e.level === 1 && !uniqueMain.has(e.code)) uniqueMain.set(e.code, e);
            if (e.level === 2 && !uniqueSub.has(e.code)) uniqueSub.set(e.code, e);
            if (e.level === 3 && !uniqueProduct.has(e.code)) uniqueProduct.set(e.code, e);
          }

          // Phase A: Level-1 categories
          const mainOrderCounters = new Map(); // parentKey -> counter
          let mainIdx = 0;
          for (const e of [...uniqueMain.values()].sort((a, b) => a.row - b.row)) {
            // eslint-disable-next-line no-await-in-loop
            const existing = await Category.findOne({ hierarchyCodes: e.code }).session(session).lean();
            const desiredSlug = slugify(e.name);
            const slug = existing
              ? existing.slug
              : await ensureUniqueCategorySlug(desiredSlug, null, session);
            const desiredOrder = ++mainIdx;
            if (existing) {
              await Category.findByIdAndUpdate(
                existing._id,
                {
                  $set: {
                    name: e.name,
                    slug,
                    description: existing.description || '',
                    isActive: true,
                    order: desiredOrder,
                    parentId: null,
                    level: 1,
                    importRaw: e.raw,
                    hierarchyCodes: Array.isArray(existing.hierarchyCodes)
                      ? Array.from(new Set([...existing.hierarchyCodes, e.code]))
                      : [e.code],
                  },
                },
                { session }
              );
              counts.categories.updated += 1;
            } else {
              await Category.create(
                [
                  {
                    name: e.name,
                    slug: slug || desiredSlug,
                    description: '',
                    imageUrl: '',
                    hierarchyCodes: [e.code],
                    level: 1,
                    isActive: true,
                    order: desiredOrder,
                    parentId: null,
                    importRaw: e.raw,
                  },
                ],
                { session }
              );
              counts.categories.created += 1;
            }
            const docId = existing ? String(existing._id) : await Category.findOne({ hierarchyCodes: e.code }).session(session).lean().then((d)=>d?String(d._id):null);
            if (docId) mainByCode.set(e.code, docId);
          }

          // Phase B: Level-2 categories
          let subIdx = 0;
          for (const e of [...uniqueSub.values()].sort((a, b) => a.row - b.row)) {
            // eslint-disable-next-line no-await-in-loop
            const hc = parseHierarchyCode(e.code);
            if (!hc) {
              errors.push({ sheet: 'Categories', row: e.row, message: `Invalid hierarchy code: ${e.code}` });
              continue;
            }
            const parentMainId = mainByCode.get(hc.mainCode);
            if (!parentMainId) {
              errors.push({
                sheet: 'Categories',
                row: e.row,
                message: `Missing level-1 parent for subcategory "${e.name}" code=${e.code} parentMain=${hc.mainCode}`,
              });
              continue;
            }

            const existing = await Category.findOne({ hierarchyCodes: e.code }).session(session).lean();
            const desiredSlug = slugify(e.name);
            const slug = existing
              ? existing.slug
              : await ensureUniqueCategorySlug(desiredSlug, null, session);
            const desiredOrder = ++subIdx;

            if (existing) {
              await Category.findByIdAndUpdate(
                existing._id,
                {
                  $set: {
                    name: e.name,
                    slug,
                    isActive: true,
                    order: desiredOrder,
                    parentId: parentMainId,
                    level: 2,
                    importRaw: e.raw,
                    hierarchyCodes: Array.isArray(existing.hierarchyCodes)
                      ? Array.from(new Set([...existing.hierarchyCodes, e.code]))
                      : [e.code],
                  },
                },
                { session }
              );
              counts.categories.updated += 1;
            } else {
              await Category.create(
                [
                  {
                    name: e.name,
                    slug: slug || desiredSlug,
                    description: '',
                    imageUrl: '',
                    hierarchyCodes: [e.code],
                    level: 2,
                    isActive: true,
                    order: desiredOrder,
                    parentId: parentMainId,
                    importRaw: e.raw,
                  },
                ],
                { session }
              );
              counts.categories.created += 1;
            }

            const doc = await Category.findOne({ hierarchyCodes: e.code }).session(session).lean();
            if (doc?._id) subByCode.set(e.code, String(doc._id));
          }

          // Phase C: Level-3 categories
          let productIdx = 0;
          for (const e of [...uniqueProduct.values()].sort((a, b) => a.row - b.row)) {
            // eslint-disable-next-line no-await-in-loop
            const hc = parseHierarchyCode(e.code);
            if (!hc) {
              errors.push({ sheet: 'Categories', row: e.row, message: `Invalid hierarchy code: ${e.code}` });
              continue;
            }
            const parentSubId = subByCode.get(hc.subCode);
            if (!parentSubId) {
              errors.push({
                sheet: 'Categories',
                row: e.row,
                message: `Missing level-2 parent for products "${e.name}" code=${e.code} parentSub=${hc.subCode}`,
              });
              continue;
            }

            // Find parent main id via parentSubId
            // eslint-disable-next-line no-await-in-loop
            const parentSubDoc = await Category.findById(parentSubId).session(session).lean();
            const parentMainId = parentSubDoc?.parentId ? String(parentSubDoc.parentId) : null;
            if (!parentMainId) {
              errors.push({
                sheet: 'Categories',
                row: e.row,
                message: `Missing level-1 parent for products "${e.name}" (via sub=${parentSubId})`,
              });
              continue;
            }

            const existing = await Category.findOne({ hierarchyCodes: e.code }).session(session).lean();
            const desiredSlug = slugify(e.name);
            const slug = existing
              ? existing.slug
              : await ensureUniqueCategorySlug(desiredSlug, null, session);
            const desiredOrder = ++productIdx;

            if (existing) {
              await Category.findByIdAndUpdate(
                existing._id,
                {
                  $set: {
                    name: e.name,
                    slug,
                    isActive: true,
                    order: desiredOrder,
                    parentId: parentSubId,
                    level: 3,
                    importRaw: e.raw,
                    hierarchyCodes: Array.isArray(existing.hierarchyCodes)
                      ? Array.from(new Set([...existing.hierarchyCodes, e.code]))
                      : [e.code],
                  },
                },
                { session }
              );
              counts.categories.updated += 1;
            } else {
              await Category.create(
                [
                  {
                    name: e.name,
                    slug: slug || desiredSlug,
                    description: '',
                    imageUrl: '',
                    hierarchyCodes: [e.code],
                    level: 3,
                    isActive: true,
                    order: desiredOrder,
                    parentId: parentSubId,
                    importRaw: e.raw,
                  },
                ],
                { session }
              );
              counts.categories.created += 1;
            }

            const doc = await Category.findOne({ hierarchyCodes: e.code }).session(session).lean();
            if (doc?._id) {
              productByCode.set(e.code, String(doc._id));
              productNameToParent.set(normalizeForMatch(e.name), {
                categoryId: parentMainId,
                subcategoryId: parentSubId,
              });
            }
          }

          // Products match index - keep list to support non-exact matches.
          const productNameCandidates = [...productNameToParent.entries()].map(([normName, ids]) => ({
            normName,
            ...ids,
          }));

          // -------------------------
          // 2) Products from SKU Master
          // -------------------------
          const skuWs = wb.getWorksheet('SKU Master');
          if (!skuWs) {
            errors.push({ sheet: 'SKU Master', message: 'Sheet "SKU Master" not found' });
          } else {
            const headerMap = makeHeaderIndexMap(skuWs, 1);
            const skuCol = findHeaderCol(headerMap, ['SKU Code', 'SKU code']);
            const nameCol = findHeaderCol(headerMap, ['SKU Name']);
            if (!skuCol || !nameCol) {
              errors.push({
                sheet: 'SKU Master',
                message: 'Missing required columns: "SKU Code" and/or "SKU Name"',
              });
            } else {
              const SKIP_VALUES = new Set([
                'SKU Code',
                'Mandatory',
                'Not Null, Unique',
                'Not Null',
                'varchar(20)',
                'varchar(100)',
              ]);

              let firstDataRow = 6;
              for (let r = 2; r <= Math.min(20, skuWs.rowCount); r += 1) {
                const probeSku = getCellText(skuWs.getRow(r), skuCol);
                const probeName = getCellText(skuWs.getRow(r), nameCol);
                if (
                  probeSku &&
                  probeName &&
                  !SKIP_VALUES.has(probeSku) &&
                  /^[A-Za-z0-9_-]+$/.test(probeSku)
                ) {
                  firstDataRow = r;
                  break;
                }
              }

              for (let r = firstDataRow; r <= skuWs.rowCount; r += 1) {
                const row = skuWs.getRow(r);
                const sku = getCellText(row, skuCol);
                const name = getCellText(row, nameCol);
                if (!sku || !name) {
                  continue;
                }
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
                doc.baseCost = doc.baseCost == null || Number.isNaN(Number(doc.baseCost)) ? 0 : Number(doc.baseCost);
                if (doc.mrp < doc.price) {
                  doc.mrp = doc.price;
                  warnings.push({ row: r, sku, message: 'MRP was lower than price, adjusted to match sale price' });
                }
                doc.originalPrice = doc.mrp;
                doc.costPrice = doc.baseCost || 0;

                // Best-effort taxonomy linkage from Categories sheet (level-3 "Products").
                const baseName = normalizeForMatch(getSkuBaseName(name));
                let matched = null;
                for (const cand of productNameCandidates) {
                  if (!cand.normName) continue;
                  if (!baseName || (!baseName.includes(cand.normName) && !cand.normName.includes(baseName))) continue;
                  // Prefer the most specific (longest) match.
                  if (!matched || cand.normName.length > matched.normName.length) matched = cand;
                }

                if (!matched) {
                  counts.products.unmatched += 1;
                  // Leave category/subcategory unset (still upserts, but won't appear in category listing).
                }

                if (!doc.imageUrl) {
                  errors.push({ sheet: 'SKU Master', row: r, sku, message: 'Missing imageUrl' });
                  counts.products.skipped += 1;
                  continue;
                }

                if (doc.price === 0) {
                  doc.isActive = false;
                  doc.status = 'inactive';
                } else {
                  doc.isActive = true;
                  doc.status = 'active';
                }

                if (matched) {
                  doc.categoryId = matched.categoryId;
                  doc.subcategoryId = matched.subcategoryId;
                }

                // eslint-disable-next-line no-await-in-loop
                const existing = await Product.findOne({ sku: doc.sku }).session(session).lean();
                if (existing) {
                  if (!overwrite) {
                    counts.products.skipped += 1;
                    continue;
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
              }

          // -------------------------
          // 5) Reconcile product taxonomy links after all category/image upserts
          // -------------------------
          const productsForRelink = await Product.find({
            $or: [{ categoryId: { $exists: false } }, { categoryId: null }, { subcategoryId: null }],
            hierarchyCode: { $exists: true, $ne: '' },
          })
            .select('_id hierarchyCode')
            .session(session)
            .lean();

          for (const p of productsForRelink) {
            const hc = parseHierarchyCode(p.hierarchyCode);
            if (!hc) continue;
            // eslint-disable-next-line no-await-in-loop
            const subDoc = await Category.findOne({ hierarchyCodes: hc.subCode }).session(session).lean();
            if (!subDoc?._id || !subDoc.parentId) continue;
            await Product.updateOne(
              { _id: p._id },
              { $set: { categoryId: subDoc.parentId, subcategoryId: subDoc._id } },
              { session }
            );
          }
            }
          }

          // -------------------------
          // 3) Banners from Banner sheet
          // -------------------------
          const bannerWs = wb.getWorksheet('Banner');
          if (!bannerWs) {
            errors.push({ sheet: 'Banner', message: 'Sheet "Banner" not found' });
          } else {
            const headerMap = makeHeaderIndexMap(bannerWs, 1);

            const slotCol = findHeaderCol(headerMap, ['slot', 'Slot']) ?? 1;
            const presModeCol = findHeaderCol(headerMap, ['presentationMode', 'Presentation Mode']) ?? 2;
            const isNavigableCol = findHeaderCol(headerMap, ['isNavigable', 'Is Navigable']) ?? 3;
            const titleCol = findHeaderCol(headerMap, ['title', 'Title']) ?? 4;
            const imageUrlCol =
              findHeaderCol(headerMap, [
                'imageUrl',
                'Image URL',
                'ImageUrl',
                'Banner Image URL',
                'Banner URL',
                'Image',
              ]) ?? 5;
            const redirectTypeCol = findHeaderCol(headerMap, ['redirectType', 'Redirect Type']) ?? 6;
            const redirectValueCol = findHeaderCol(headerMap, ['redirectValue', 'Redirect Value']) ?? 7;
            const isActiveCol = findHeaderCol(headerMap, ['isActive', 'Is Active']) ?? 8;
            const startDateCol = findHeaderCol(headerMap, ['startDate', 'Start Date']) ?? 9;
            const endDateCol = findHeaderCol(headerMap, ['endDate', 'End Date']) ?? 10;
            const orderCol = findHeaderCol(headerMap, ['order', 'Order']) ?? 11;

            const contentTypeCol = findHeaderCol(headerMap, ['contentItems.type', 'Content Type']) ?? 12;
            const contentImageUrlCol =
              findHeaderCol(headerMap, ['contentItems.imageUrl', 'Content Image URL', 'Content imageUrl']) ?? 13;
            const contentBlockTitleCol =
              findHeaderCol(headerMap, ['contentItems.blockTitle', 'Content Block Title']) ?? 14;
            const contentLinkCol = findHeaderCol(headerMap, ['contentItems.link', 'Content Link']) ?? 15;
            const contentIsNavigableCol =
              findHeaderCol(headerMap, ['contentItems.isNavigable', 'Content Is Navigable']) ?? 16;
            const contentOrderCol = findHeaderCol(headerMap, ['contentItems.order', 'Content Order']) ?? 17;

            const allowedSlots = new Set(['hero', 'small', 'mid', 'large', 'info', 'category']);
            const bannerGroups = new Map(); // key -> { base, items: [] }

            for (let r = 2; r <= bannerWs.rowCount; r += 1) {
              const row = bannerWs.getRow(r);
              const rawRow = rowToRawObject(row, headerMap);
              const slot = getCellText(row, slotCol).trim().toLowerCase();
              if (!allowedSlots.has(slot)) continue;
              const presentationMode = getCellText(row, presModeCol) || 'single';
              const isNavigable = parseBoolean(getCellText(row, isNavigableCol), true);
              const title = getCellText(row, titleCol);
              const imageUrl = getCellText(row, imageUrlCol);
              if (!imageUrl || !String(imageUrl).toLowerCase().includes('http')) continue;

              const redirectType = getCellText(row, redirectTypeCol);
              const redirectValue = getCellText(row, redirectValueCol);
              const isActive = parseBoolean(getCellText(row, isActiveCol), true);
              const startDate = parseDateCell(row.getCell(startDateCol)?.value);
              const endDate = parseDateCell(row.getCell(endDateCol)?.value);
              const order = Number.parseInt(getCellText(row, orderCol), 10) || (r - 1);

              const contentTypeRaw = getCellText(row, contentTypeCol);
              const contentType = mapBannerContentType(contentTypeRaw);
              const contentImageUrl = getCellText(row, contentImageUrlCol);
              const contentBlockTitle = getCellText(row, contentBlockTitleCol);
              const contentLink = getCellText(row, contentLinkCol);
              const contentIsNavigable = parseBoolean(getCellText(row, contentIsNavigableCol), true);
              const contentOrder = Number.parseInt(getCellText(row, contentOrderCol), 10) || 1;

              const key = `${slot}|${order}`;
              if (!bannerGroups.has(key)) {
                bannerGroups.set(key, {
                  slot,
                  presentationMode: presentationMode === 'carousel' ? 'carousel' : 'single',
                  isNavigable,
                  title: title || '',
                  imageUrl,
                  redirectType: redirectType || null,
                  redirectValue: redirectValue || null,
                  isActive,
                  startDate,
                  endDate,
                  order,
                  contentItems: [],
                  rawRows: [],
                });
              }
              bannerGroups.get(key).rawRows.push(rawRow);

              if (contentType && (contentImageUrl || contentBlockTitle || contentLink)) {
                bannerGroups.get(key).contentItems.push({
                  type: contentType,
                  order: contentOrder,
                  imageUrl: contentImageUrl || undefined,
                  text: contentType === 'text' ? (contentBlockTitle || undefined) : undefined,
                  blockTitle: contentBlockTitle || undefined,
                  link: contentLink || undefined,
                  isNavigable: contentIsNavigable,
                });
              }
            }

            const allowedRedirectTypes = new Set([
              'url',
              'category',
              'subcategory',
              'collection',
              'section',
              'product',
              'search',
              'none',
              'page',
              'screen',
              'banner',
            ]);

            const resolveCategoryId = async (value) => {
              const v = String(value || '').trim();
              if (!v) return null;
              if (mongoose.Types.ObjectId.isValid(v)) {
                // eslint-disable-next-line no-await-in-loop
                const doc = await Category.findById(v).session(session).lean();
                return doc?._id ? String(doc._id) : null;
              }
              // Try slug
              // eslint-disable-next-line no-await-in-loop
              let doc = await Category.findOne({ slug: v }).session(session).lean();
              if (doc?._id) return String(doc._id);
              // Try hierarchy code
              if (/[A-Za-z]\d+/.test(v)) {
                // eslint-disable-next-line no-await-in-loop
                doc = await Category.findOne({ hierarchyCodes: v }).session(session).lean();
                if (doc?._id) return String(doc._id);
              }
              // Fallback by name
              // eslint-disable-next-line no-await-in-loop
              doc = await Category.findOne({ name: v }).session(session).lean();
              return doc?._id ? String(doc._id) : null;
            };

            for (const group of bannerGroups.values()) {
              // eslint-disable-next-line no-await-in-loop
              let bannerCategoryId = null;
              if (group.slot === 'category' && group.redirectValue) {
                // eslint-disable-next-line no-await-in-loop
                bannerCategoryId = await resolveCategoryId(group.redirectValue);
              }

              const contentItems = Array.isArray(group.contentItems) ? group.contentItems : [];
              contentItems.sort((a, b) => (a.order || 1) - (b.order || 1));

              const update = {
                slot: group.slot,
                presentationMode: group.presentationMode,
                isNavigable: group.isNavigable,
                title: group.title,
                imageUrl: group.imageUrl,
                redirectType: group.redirectType && allowedRedirectTypes.has(group.redirectType) ? group.redirectType : null,
                redirectValue: group.redirectValue || null,
                categoryId: bannerCategoryId || null,
                isActive: group.isActive,
                ...(group.startDate ? { startDate: group.startDate } : {}),
                ...(group.endDate ? { endDate: group.endDate } : {}),
                order: group.order,
                contentItems,
                importRaw: { rows: group.rawRows || [] },
              };

              const filter = { slot: group.slot, order: group.order };
              await Banner.findOneAndUpdate(filter, { $set: update }, { upsert: true, new: false, session });
              counts.banners.upserted += 1;
            }
          }

          // -------------------------
          // 4) Category Display Images
          // -------------------------
          const cdWs = wb.getWorksheet('Category Display Image');
          const cdAltWs = wb.getWorksheet('Catogory display Image');
          const imgWs = cdWs || cdAltWs;

          if (!imgWs) {
            errors.push({ sheet: 'Category Display Image', message: 'Sheet not found' });
          } else {
            const headerMap = makeHeaderIndexMap(imgWs, 1);
            const levelHeaderKey =
              headerMap.get('Category Level') != null
                ? 'Category Level'
                : [...headerMap.keys()].find((k) => normalizeHeaderKey(k) === 'category level') ?? null;
            const nameHeaderKey =
              headerMap.get('Category Name') != null
                ? 'Category Name'
                : [...headerMap.keys()].find((k) => normalizeHeaderKey(k) === 'category name') ?? null;
            const urlHeaderKey =
              headerMap.get('Display Image URL') != null
                ? 'Display Image URL'
                : [...headerMap.keys()].find((k) => normalizeHeaderKey(k) === 'display image url') ?? null;
            const refHeaderKey =
              headerMap.get('Hierarchy Code Ref') != null
                ? 'Hierarchy Code Ref'
                : [...headerMap.keys()].find((k) => normalizeHeaderKey(k).includes('hierarchy code')) ?? null;

            const levelCol = levelHeaderKey ? headerMap.get(levelHeaderKey) : null;
            const nameCol = nameHeaderKey ? headerMap.get(nameHeaderKey) : null;
            const urlCol = urlHeaderKey ? headerMap.get(urlHeaderKey) : null;
            const refCol = refHeaderKey ? headerMap.get(refHeaderKey) : null;

            if (!levelCol || !nameCol || !urlCol) {
              errors.push({
                sheet: 'Category Display Image',
                message: `Missing required headers. Found: ${[...headerMap.keys()].join(', ')}`,
              });
            } else {
              const isMainLevel = (v) => {
                const t = normalizeForMatch(v);
                return t === 'main category' || t === 'category';
              };
              const isSubLevel = (v) => {
                const t = normalizeForMatch(v);
                return t === 'sub category' || t === 'subcategory';
              };
              const isProductLevel = (v) => {
                const t = normalizeForMatch(v);
                // Hyphens become spaces in normalizeForMatch, so "Sub-Sub" → "sub sub".
                // Mastersheets often use "Product (Sub-Sub Category)" → "product sub sub category".
                return (
                  t === 'sub sub category' ||
                  t === 'sub sub category 1' ||
                  t === 'products' ||
                  t === 'product sub sub category' ||
                  (t.includes('product') && t.includes('sub') && t.includes('category'))
                );
              };

              // While iterating rows, keep track of the last seen hierarchy names.
              // Product rows inherit their parent names from the most recent Main/Sub rows above.
              let currentMainName = '';
              let currentMainImageUrl = '';
              let currentSubName = '';
              let currentSubImageUrl = '';

              let mainOrder = 0;
              let subOrder = 0;
              let productOrder = 0;

              const upsertCategoryByCode = async ({ level, code, name, parentId, imageUrl, raw }) => {
                const existing = await Category.findOne({ hierarchyCodes: code }).session(session).lean();
                if (existing) {
                  await Category.findByIdAndUpdate(
                    existing._id,
                    {
                      $set: {
                        name: name || existing.name,
                        parentId: parentId || null,
                        level,
                        isActive: true,
                        ...(typeof imageUrl === 'string' && imageUrl.trim() ? { imageUrl } : {}),
                        importRaw: raw || existing.importRaw || null,
                        hierarchyCodes: Array.isArray(existing.hierarchyCodes)
                          ? Array.from(new Set([...existing.hierarchyCodes, code]))
                          : [code],
                      },
                    },
                    { session }
                  );
                  return String(existing._id);
                }

                const slug = await ensureUniqueCategorySlug(slugify(name || 'category'), null, session);
                const order = level === 1 ? ++mainOrder : level === 2 ? ++subOrder : ++productOrder;

                const created = await Category.create(
                  [
                    {
                      name: name || 'category',
                      slug,
                      description: '',
                      imageUrl: imageUrl || '',
                      hierarchyCodes: [code],
                      level,
                      isActive: true,
                      order,
                      parentId: parentId || null,
                      importRaw: raw || null,
                    },
                  ],
                  { session }
                );
                return String(created?.[0]?._id || created?._id || '');
              };

              for (let r = 2; r <= imgWs.rowCount; r += 1) {
                const row = imgWs.getRow(r);
                const levelRaw = getCellText(row, levelCol);
                const catName = getCellText(row, nameCol);
                const imageUrl = getCellText(row, urlCol);
                const codeRef = refCol ? getCellText(row, refCol) : '';
                const raw = rowToRawObject(row, headerMap);

                if (!levelRaw || !catName || !imageUrl) continue;
                if (!String(imageUrl).toLowerCase().includes('http')) continue;

                if (isMainLevel(levelRaw)) {
                  currentMainName = catName;
                  currentMainImageUrl = imageUrl;
                  const mainCodes = expandCodeRange(codeRef);
                  if (mainCodes.length > 0) {
                    const hc = parseHierarchyCode(mainCodes[0]);
                    if (hc) {
                      // eslint-disable-next-line no-await-in-loop
                      await upsertCategoryByCode({
                        level: 1,
                        code: hc.mainCode,
                        name: catName,
                        parentId: null,
                        imageUrl,
                        raw,
                      });
                      counts.images.updated += 1;
                    }
                  }
                  continue;
                }

                if (isSubLevel(levelRaw)) {
                  currentSubName = catName;
                  currentSubImageUrl = imageUrl;
                  const subCodes = expandCodeRange(codeRef);
                  if (subCodes.length > 0) {
                    const hc = parseHierarchyCode(subCodes[0]);
                    if (hc) {
                      // eslint-disable-next-line no-await-in-loop
                      const mainDoc = await Category.findOne({ hierarchyCodes: hc.mainCode }).session(session).lean();
                      const parentMainId = mainDoc?._id ? String(mainDoc._id) : null;
                      if (parentMainId) {
                        // eslint-disable-next-line no-await-in-loop
                        await upsertCategoryByCode({
                          level: 2,
                          code: hc.subCode,
                          name: catName,
                          parentId: parentMainId,
                          imageUrl,
                          raw,
                        });
                        counts.images.updated += 1;
                      } else {
                        warnings.push({
                          sheet: 'Category Display Image',
                          row: r,
                          message: `Subcategory image row: no level-1 category for main code ${hc.mainCode}`,
                        });
                      }
                    }
                  }
                  continue;
                }

                if (isProductLevel(levelRaw)) {
                  // For Sub-Sub Category / Products: ensure/create level-3 + parent categories and set images.
                  const codes = expandCodeRange(codeRef);
                  if (codes.length === 0) continue;

                  for (const productCode of codes) {
                    const hc = parseHierarchyCode(productCode);
                    if (!hc) continue;

                    // eslint-disable-next-line no-await-in-loop
                    const mainId = await upsertCategoryByCode({
                      level: 1,
                      code: hc.mainCode,
                      name: currentMainName || catName,
                      parentId: null,
                      imageUrl: currentMainImageUrl,
                      raw,
                    });

                    // eslint-disable-next-line no-await-in-loop
                    const subId = await upsertCategoryByCode({
                      level: 2,
                      code: hc.subCode,
                      name: currentSubName || catName,
                      parentId: mainId,
                      imageUrl: currentSubImageUrl,
                      raw,
                    });

                    // eslint-disable-next-line no-await-in-loop
                    await upsertCategoryByCode({
                      level: 3,
                      code: productCode,
                      name: catName,
                      parentId: subId,
                      imageUrl,
                      raw,
                    });
                    counts.images.updated += 1;
                  }
                }
              }
            }
          }
        }
      }

      // If categories sheet existed but parsing failed early, product/banner/image counts may be partial.
  };

  try {
    try {
      await session.withTransaction(run);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes('Transaction numbers are only allowed')) {
        // Standalone MongoDB (no replica set) disallows transactions.
        warnings.push({
          sheet: 'Mongo',
          message: 'MongoDB transactions are not supported on this connection; running import without transaction.',
        });
        await run();
      } else {
        throw err;
      }
    }
  } finally {
    await session.endSession();
  }

  return {
    success: errors.length === 0,
    counts,
    warnings,
    errors,
  };
}

module.exports = { importContentHubMaster };

