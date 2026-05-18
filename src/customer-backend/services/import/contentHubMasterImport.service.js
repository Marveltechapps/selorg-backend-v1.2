const ExcelJS = require('exceljs');

const { Category } = require('../../models/Category');
const { Product } = require('../../models/Product');
const { applySkuRowToProductDoc, rebuildSkuMediaFromRow } = require('./skuMasterProductHydration');
const { applyBannerDetails } = require('./bannerDetailsImport.service');
const { applyHomePageContent } = require('./homePageContentImport.service');

/** Apply Mongo session when present; when null/undefined, run without session (non-transactional). */
function bindSession(query, sess) {
  return sess == null ? query : query.session(sess);
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

function normalizeHeaderKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
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
    const exists = await bindSession(Category.findOne(q), session).lean();
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

/** Stable hierarchy key when sheet omits code: path from main → sub → leaf (no numeric parent rules). */
function stableSheetHierarchyCode(level, carryMain, carrySub, name, row) {
  const sm = slugify(carryMain || 'root');
  const leaf = slugify(name || 'item');
  if (level === 1) return `__sheet/L1/r${row}/${leaf}`;
  if (level === 2) return `__sheet/L2/${sm}/r${row}/${leaf}`;
  return `__sheet/L3/${sm}/${slugify(carrySub || 'sub')}/r${row}/${leaf}`;
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

// ─── Top-level category name → token set (used by Display Image name fallback) ───
// Handles plural/singular ("Millet" vs "Millets"), filler words like "category",
// and well-known typos ("Diary" vs "Dairy") that appear between the sheet tabs.
const CATEGORY_NAME_ALIASES = new Map([['diary', 'dairy']]);
const CATEGORY_NAME_STOPWORDS = new Set(['category', 'categories', 'the', 'a', 'an']);

function stemCategoryToken(t) {
  if (!t) return '';
  if (CATEGORY_NAME_ALIASES.has(t)) return CATEGORY_NAME_ALIASES.get(t);
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

function categoryTokenSet(s) {
  return new Set(
    normalizeForMatch(s)
      .split(/\s+/)
      .filter((t) => t && !CATEGORY_NAME_STOPWORDS.has(t))
      .map(stemCategoryToken)
      .filter(Boolean)
  );
}

/**
 * Update imageUrl for every top-level category whose token set is a superset of
 * the sheet name's token set. Returns the number of categories updated.
 * Only writes when the new imageUrl is non-empty and the existing one is empty
 * OR the names share an exact normalized match (to avoid clobbering manual edits).
 */
async function applyMainCategoryImageByName(sheetName, imageUrl, txnSession) {
  const url = String(imageUrl || '').trim();
  if (!url || !sheetName) return 0;
  const sheetTokens = categoryTokenSet(sheetName);
  if (sheetTokens.size === 0) return 0;

  const tops = await bindSession(
    Category.find({ parentId: null, isActive: true, level: 1 }).select('_id name imageUrl'),
    txnSession
  ).lean();

  let updated = 0;
  for (const cat of tops) {
    const dbTokens = categoryTokenSet(cat.name);
    const isSuperset = [...sheetTokens].every((t) => dbTokens.has(t));
    if (!isSuperset) continue;
    // Skip overwriting if the existing imageUrl is already this exact URL.
    if (String(cat.imageUrl || '').trim() === url) continue;
    // eslint-disable-next-line no-await-in-loop
    await Category.updateOne(
      { _id: cat._id },
      { $set: { imageUrl: url } },
      { session: txnSession || undefined }
    );
    updated += 1;
  }
  return updated;
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

async function importContentHubMaster(buffer, { overwrite = true } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const counts = {
    categories: { created: 0, updated: 0, skipped: 0 },
    products: { created: 0, updated: 0, skipped: 0, unmatched: 0 },
    banners: { upserted: 0 },
    images: { updated: 0 },
    homeSections: { replaced: 0, skipped: 0 },
  };

  const errors = [];
  const warnings = [];

  const executeImport = async (txnSession) => {
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
          // Categories: 3 levels follow sheet order (forward-filled main/sub). No numeric parent rules on hierarchy codes.
          let carryMain = '';
          let carrySub = '';
          let currentMainId = null;
          let currentSubId = null;
          const productNameToParent = new Map();
          let mainIdx = 0;
          let subIdx = 0;
          let productIdx = 0;

          const upsertCategoryNode = async (level, name, parentId, orderVal, userCode, rowNum, rawRow) => {
            const codeTrim = String(userCode || '').trim();
            const internalKey = codeTrim || stableSheetHierarchyCode(level, carryMain, carrySub, name, rowNum);
            let existing = null;
            if (codeTrim) {
              existing = await Category.findOne({ hierarchyCodes: codeTrim }).session(txnSession).lean();
            }
            if (!existing && parentId != null) {
              existing = await Category.findOne({ parentId, level, name }).session(txnSession).lean();
            }
            if (!existing && level === 1) {
              // Case-insensitive match prevents the mastersheet's "RICE Mandi" / "Rice Mandi" rows
              // from creating two separate top-level categories that show up as duplicate home tiles.
              const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              existing = await Category.findOne({
                level: 1,
                parentId: null,
                name: { $regex: `^${escaped}$`, $options: 'i' },
              }).session(txnSession).lean();
            }
            const desiredSlug = slugify(name);
            const slug = existing
              ? existing.slug
              : await ensureUniqueCategorySlug(desiredSlug, null, txnSession);
            const codesToSet = codeTrim
              ? Array.from(new Set([...(Array.isArray(existing?.hierarchyCodes) ? existing.hierarchyCodes : []), codeTrim]))
              : [internalKey];
            if (existing) {
              await Category.findByIdAndUpdate(
                existing._id,
                {
                  $set: {
                    name,
                    slug,
                    isActive: true,
                    order: orderVal,
                    parentId: parentId || null,
                    level,
                    importRaw: rawRow,
                    hierarchyCodes: codesToSet,
                  },
                },
                { session: txnSession }
              );
              counts.categories.updated += 1;
              return String(existing._id);
            }
            const created = await Category.create(
              [
                {
                  name,
                  slug: slug || desiredSlug,
                  description: '',
                  imageUrl: '',
                  hierarchyCodes: codeTrim ? [codeTrim] : [internalKey],
                  level,
                  isActive: true,
                  order: orderVal,
                  parentId: parentId || null,
                  importRaw: rawRow,
                },
              ],
              { session: txnSession }
            );
            counts.categories.created += 1;
            return String(created[0]._id);
          };

          for (let r = 2; r <= catsWs.rowCount; r += 1) {
            const row = catsWs.getRow(r);
            const mainRaw = getCellText(row, headerMap.get(mainCol));
            const subRaw = getCellText(row, headerMap.get(subCol));
            const productRaw = getCellText(row, headerMap.get(productCol));
            const codeRaw = getCellText(row, headerMap.get(hierarchyCodeCol));

            if (!mainRaw && !subRaw && !productRaw) continue;

            const raw = rowToRawObject(row, headerMap);
            const productTrim = productRaw ? String(productRaw).trim() : '';

            if (mainRaw) {
              carryMain = String(mainRaw).trim();
              carrySub = '';
              currentSubId = null;
            }
            if (subRaw) {
              carrySub = String(subRaw).trim();
            }

            if (productTrim) {
              const name = productTrim;
              if (!carryMain) {
                errors.push({
                  sheet: 'Categories',
                  row: r,
                  message: `Product "${name}" has no Main Category row above it`,
                });
                continue;
              }
              if (!carrySub) {
                errors.push({
                  sheet: 'Categories',
                  row: r,
                  message: `Product "${name}" has no Sub Category row above it`,
                });
                continue;
              }
              if (!currentMainId) {
                errors.push({
                  sheet: 'Categories',
                  row: r,
                  message: `Product "${name}" — process a Main Category row before product rows`,
                });
                continue;
              }
              if (!currentSubId) {
                errors.push({
                  sheet: 'Categories',
                  row: r,
                  message: `Product "${name}" — process a Sub Category row before product rows`,
                });
                continue;
              }
              const parentMainId = currentMainId;
              const parentSubId = currentSubId;
              // eslint-disable-next-line no-await-in-loop
              await upsertCategoryNode(3, name, parentSubId, ++productIdx, codeRaw, r, raw);
              productNameToParent.set(normalizeForMatch(name), {
                categoryId: parentMainId,
                subcategoryId: parentSubId,
              });
            } else {
              if (mainRaw) {
                const name = String(mainRaw).trim();
                // eslint-disable-next-line no-await-in-loop
                currentMainId = await upsertCategoryNode(1, name, null, ++mainIdx, codeRaw, r, raw);
              }
              if (subRaw) {
                const name = String(subRaw).trim();
                if (!carryMain) {
                  errors.push({ sheet: 'Categories', row: r, message: `Subcategory "${name}" has no Main Category above` });
                  continue;
                }
                if (!currentMainId) {
                  errors.push({
                    sheet: 'Categories',
                    row: r,
                    message: `Subcategory "${name}" — add a Main Category row first (with name in Main column)`,
                  });
                  continue;
                }
                // If Main and Sub are on the same row, hierarchy code applies to Main only; Sub uses auto-key or lookup by parent+name.
                const subCodeForRow = mainRaw ? '' : codeRaw;
                // eslint-disable-next-line no-await-in-loop
                currentSubId = await upsertCategoryNode(2, name, currentMainId, ++subIdx, subCodeForRow, r, raw);
              }
            }
          }

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
              const salePriceCol = findHeaderCol(headerMap, ['Sale Price']);
              const mrpCol = findHeaderCol(headerMap, ['MSRP/MRP', 'MRP', 'MSRP']);
              const baseCostCol = findHeaderCol(headerMap, ['Base Cost']);
              const isSaleableCol = findHeaderCol(headerMap, ['Is Saleable']);

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

                // Fallback: Try hierarchy-code-based matching when name matching fails
                if (!matched && doc.hierarchyCode) {
                  const hc = parseHierarchyCode(String(doc.hierarchyCode || '').trim());
                  if (hc) {
                    // eslint-disable-next-line no-await-in-loop
                    const leaf = await Category.findOne({ hierarchyCodes: hc.productCode || hc.fullCode, level: 3 }).session(txnSession).lean();
                    if (leaf?.parentId) {
                      // eslint-disable-next-line no-await-in-loop
                      const subDoc = await Category.findById(leaf.parentId).session(txnSession).lean();
                      if (subDoc?.parentId) {
                        matched = { categoryId: subDoc.parentId, subcategoryId: subDoc._id };
                      }
                    }
                    if (!matched && hc.subCode) {
                      // eslint-disable-next-line no-await-in-loop
                      const subDoc = await Category.findOne({ hierarchyCodes: hc.subCode, level: 2 }).session(txnSession).lean();
                      if (subDoc?._id && subDoc.parentId) {
                        matched = { categoryId: subDoc.parentId, subcategoryId: subDoc._id };
                      }
                    }
                  }
                }

                if (!matched) {
                  counts.products.unmatched += 1;
                  // Leave category/subcategory unset (still upserts, but won't appear in category listing).
                }

                // Reuse existing media when SKU row omits image columns.
                // This prevents unnecessary skips for maintenance-only sheet updates.
                // eslint-disable-next-line no-await-in-loop
                const existing = await Product.findOne({ sku: doc.sku }).session(txnSession).lean();
                const rawSalePrice = salePriceCol ? getCellText(row, salePriceCol) : '';
                const rawMrp = mrpCol ? getCellText(row, mrpCol) : '';
                const rawBaseCost = baseCostCol ? getCellText(row, baseCostCol) : '';
                const rawIsSaleable = isSaleableCol ? getCellText(row, isSaleableCol) : '';
                const hasSalePrice = String(rawSalePrice || '').trim() !== '';
                const hasMrp = String(rawMrp || '').trim() !== '';
                const hasBaseCost = String(rawBaseCost || '').trim() !== '';
                const hasIsSaleable = String(rawIsSaleable || '').trim() !== '';
                if (!doc.imageUrl && existing?.imageUrl) {
                  doc.imageUrl = String(existing.imageUrl);
                }
                if (!Array.isArray(doc.images) || doc.images.length === 0) {
                  if (Array.isArray(existing?.images) && existing.images.length > 0) {
                    doc.images = existing.images;
                  } else if (doc.imageUrl) {
                    doc.images = [doc.imageUrl];
                  }
                }
                if (!Array.isArray(doc.additionalImages) || doc.additionalImages.length === 0) {
                  if (Array.isArray(existing?.additionalImages) && existing.additionalImages.length > 0) {
                    doc.additionalImages = existing.additionalImages;
                  } else if (Array.isArray(doc.images) && doc.images.length > 1) {
                    doc.additionalImages = doc.images.slice(1);
                  }
                }

                if (!doc.imageUrl) {
                  // Data-quality skip, not a system failure: log as warning and continue with the rest of the sheet.
                  warnings.push({ sheet: 'SKU Master', row: r, sku, message: 'Skipped: missing Image URL (row was not imported)' });
                  counts.products.skipped += 1;
                  continue;
                }

                if (existing && !hasSalePrice) {
                  doc.price = Number(existing.price) || 0;
                }
                if (existing && !hasMrp) {
                  doc.mrp = Number(existing.mrp) || doc.price || 0;
                  doc.originalPrice = doc.mrp;
                }
                if (existing && !hasBaseCost) {
                  doc.baseCost = Number(existing.baseCost) || 0;
                  doc.costPrice = Number(existing.costPrice) || doc.baseCost || 0;
                }
                if (existing && !hasIsSaleable) {
                  doc.isSaleable = existing.isSaleable !== false;
                } else if (!existing && !hasIsSaleable) {
                  doc.isSaleable = true;
                }

                if (!existing && !hasSalePrice) {
                  // Cannot create a brand-new product with no price. This is a data-quality skip
                  // (not a run-level failure) — report as warning so the import still succeeds overall.
                  warnings.push({
                    sheet: 'SKU Master',
                    row: r,
                    sku,
                    message: 'Skipped new SKU: Sale Price is empty. Add Sale Price in the sheet to create this product.',
                  });
                  counts.products.skipped += 1;
                  continue;
                }

                if (doc.price === 0 || doc.isSaleable === false) {
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
                    { session: txnSession }
                  );
                  counts.products.updated += 1;
                } else {
                  await Product.create([doc], { session: txnSession });
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
            .session(txnSession)
            .lean();

          for (const p of productsForRelink) {
            const hcRaw = String(p.hierarchyCode || '').trim();
            if (!hcRaw) continue;
            // eslint-disable-next-line no-await-in-loop
            const leaf = await Category.findOne({ hierarchyCodes: hcRaw, level: 3 }).session(txnSession).lean();
            if (leaf?.parentId) {
              // eslint-disable-next-line no-await-in-loop
              const subDoc = await Category.findById(leaf.parentId).session(txnSession).lean();
              if (subDoc?.parentId) {
                await Product.updateOne(
                  { _id: p._id },
                  { $set: { categoryId: subDoc.parentId, subcategoryId: subDoc._id } },
                  { session: txnSession }
                );
                continue;
              }
            }
            const hc = parseHierarchyCode(hcRaw);
            if (!hc) continue;
            // eslint-disable-next-line no-await-in-loop
            const subDoc = await Category.findOne({ hierarchyCodes: hc.subCode }).session(txnSession).lean();
            if (!subDoc?._id || !subDoc.parentId) continue;
            await Product.updateOne(
              { _id: p._id },
              { $set: { categoryId: subDoc.parentId, subcategoryId: subDoc._id } },
              { session: txnSession }
            );
          }

            }
          }

          // -------------------------
          // 3) Banners from Banner Details sheet (auto-detects legacy vs Selorg_Final_Template format)
          // -------------------------
          await applyBannerDetails(wb, { session: txnSession, counts, warnings, errors });

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
                const existing = await Category.findOne({ hierarchyCodes: code }).session(txnSession).lean();
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
                    { session: txnSession }
                  );
                  return String(existing._id);
                }

                const slug = await ensureUniqueCategorySlug(slugify(name || 'category'), null, txnSession);
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
                  { session: txnSession }
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
                  } else {
                    // No Hierarchy Code Ref → fall back to name-based matching so we still
                    // refresh the imageUrl for existing top-level categories whose names
                    // don't line up 1:1 with the Categories tab (e.g. sheet "Fruits" vs DB
                    // "FRUITS", sheet "Rice" vs DB "Rice Mandi"). We update every top-level
                    // category whose token set is a superset of the sheet name's token set
                    // (so "Rice" updates both "Rice Mandi" and the legacy "RICE Mandi").
                    // eslint-disable-next-line no-await-in-loop
                    const updated = await applyMainCategoryImageByName(
                      catName,
                      imageUrl,
                      txnSession
                    );
                    counts.images.updated += updated;
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
                      const mainDoc = await Category.findOne({ hierarchyCodes: hc.mainCode }).session(txnSession).lean();
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

          // -------------------------
          // 4b) Backfill sub-category imageUrl from a linked product (last resort).
          //
          // Top-level (level 1) tiles must use the curated "Category Display Image" art —
          // grabbing a random product image for them produces wrong-looking home tiles
          // (e.g. a boiled-rice photo on the Vegetables tile). Sub-categories (level 2)
          // can still benefit from a fallback when the sheet has no display image for them.
          // -------------------------
          const subcategoriesMissingImage = await Category.find({
            isActive: true,
            level: 2,
            $or: [{ imageUrl: { $exists: false } }, { imageUrl: '' }, { imageUrl: null }],
          })
            .select('_id')
            .session(txnSession)
            .lean();

          for (const cat of subcategoriesMissingImage) {
            const productFilter = {
              $or: [{ subcategoryId: cat._id }, { categoryId: cat._id }],
              imageUrl: { $exists: true, $ne: '' },
            };
            // eslint-disable-next-line no-await-in-loop
            const sampleProduct = await Product.findOne(productFilter).select('imageUrl').session(txnSession).lean();
            if (!sampleProduct?.imageUrl) continue;
            // eslint-disable-next-line no-await-in-loop
            await Category.updateOne(
              { _id: cat._id, $or: [{ imageUrl: { $exists: false } }, { imageUrl: '' }, { imageUrl: null }] },
              { $set: { imageUrl: String(sampleProduct.imageUrl) } },
              { session: txnSession }
            );
          }
        }
      }

      // If categories sheet existed but parsing failed early, product/banner/image counts may be partial.

      // -------------------------
      // 5) Home Page Content sheet → customer_home_section_definitions
      // Must run AFTER products/categories/banners are upserted so name/SKU/bannerId
      // references resolve against the freshly-imported data.
      // -------------------------
      try {
        await applyHomePageContent(wb, { session: txnSession, counts, warnings, errors });
      } catch (e) {
        errors.push({ sheet: 'Home Page Content', message: `Home layout regeneration failed: ${e.message}` });
      }
  };

  // Same rationale as skuMasterImport: one long-lived transaction for whole-sheet imports hits
  // MongoDB time/size limits; the previous fallback re-ran the entire import (2× duration + mixed counts).
  await executeImport(null);

  return {
    success: errors.length === 0,
    counts,
    warnings,
    errors,
  };
}

module.exports = { importContentHubMaster };

