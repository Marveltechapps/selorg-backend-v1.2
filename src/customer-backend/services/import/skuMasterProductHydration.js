/**
 * Maps SKU Master column headers → Product schema paths (Content Hub + SKU Master upload).
 * Headers: trim, lower, collapse spaces, strip parentheses (see normalizeHeaderKey).
 */

function normalizeHeaderKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
}

/** @typedef {{ path: string, kind: 'string'|'price'|'number'|'bool'|'classification'|'hsn' }} Mapping */

function buildHeaderPathMap() {
  /** @type {Array<{ aliases: string[], path: string, kind: Mapping['kind'] }>} */
  const entries = [
    { aliases: ['sku code', 'skucode'], path: 'sku', kind: 'string' },
    { aliases: ['sku name'], path: 'name', kind: 'string' },
    { aliases: ['sku classification', 'sku classification col c'], path: 'classification', kind: 'classification' },
    { aliases: ['sku classification.1', 'sku tag', 'tag'], path: 'tag', kind: 'string' },
    { aliases: ['similar products'], path: 'similarProducts', kind: 'string' },
    { aliases: ['associated client name'], path: 'associatedClientName', kind: 'string' },
    { aliases: ['style attributes'], path: 'styleAttributes', kind: 'string' },
    { aliases: ['style'], path: 'style', kind: 'string' },
    { aliases: ['sku source'], path: 'skuSource', kind: 'string' },
    { aliases: ['size', 'sku size'], path: 'size', kind: 'string' },
    { aliases: ['colour', 'color'], path: 'colour', kind: 'string' },
    { aliases: ['material'], path: 'material', kind: 'string' },
    { aliases: ['primary upc/ean', 'primary upc ean'], path: 'upcEan', kind: 'string' },
    { aliases: ['country of origin'], path: 'countryOfOrigin', kind: 'string' },
    { aliases: ['hierarchy code', 'category hierarchy code'], path: 'hierarchyCode', kind: 'string' },
    { aliases: ['mfg sku code', 'mfg skucode'], path: 'mfgSkuCode', kind: 'string' },
    { aliases: ['primary vendor', 'vendor code'], path: 'vendorCode', kind: 'string' },
    { aliases: ['brand code'], path: 'brandCode', kind: 'string' },
    { aliases: ['qc required'], path: 'qcRequired', kind: 'bool' },
    { aliases: ['back order'], path: 'backOrderAllowed', kind: 'bool' },
    { aliases: ['back order qty'], path: 'backOrderQty', kind: 'number' },
    { aliases: ['msrp/mrp', 'mrp', 'msrp'], path: 'mrp', kind: 'price' },
    { aliases: ['sale price'], path: 'price', kind: 'price' },
    { aliases: ['base cost'], path: 'baseCost', kind: 'price' },
    { aliases: ['link to store', 'store links'], path: 'storeLinks', kind: 'string' },
    { aliases: ['height(cm)', 'height cm'], path: 'dimensions.heightCm', kind: 'number' },
    { aliases: ['length(cm)', 'length cm'], path: 'dimensions.lengthCm', kind: 'number' },
    { aliases: ['width(cm)', 'width cm'], path: 'dimensions.widthCm', kind: 'number' },
    { aliases: ['cube'], path: 'dimensions.cube', kind: 'number' },
    { aliases: ['weight(kg)', 'weight kg'], path: 'dimensions.weightKg', kind: 'number' },
    { aliases: ['udf 1', 'udf1'], path: 'udf.udf1', kind: 'string' },
    { aliases: ['udf 2', 'udf2'], path: 'udf.udf2', kind: 'string' },
    { aliases: ['udf 3', 'udf3'], path: 'udf.udf3', kind: 'string' },
    { aliases: ['udf 4', 'udf4'], path: 'udf.udf4', kind: 'string' },
    { aliases: ['udf 5', 'udf5'], path: 'udf.udf5', kind: 'string' },
    { aliases: ['udf 6', 'udf6'], path: 'udf.udf6', kind: 'string' },
    { aliases: ['udf 7', 'udf7'], path: 'udf.udf7', kind: 'string' },
    { aliases: ['udf 8', 'udf8'], path: 'udf.udf8', kind: 'string' },
    { aliases: ['budf 8'], path: 'budf8', kind: 'string' },
    { aliases: ['udf 9', 'udf9'], path: 'udf.udf9', kind: 'string' },
    { aliases: ['udf 10', 'udf10'], path: 'udf.udf10', kind: 'string' },
    { aliases: ['about'], path: 'description.about', kind: 'string' },
    { aliases: ['nutrition'], path: 'description.nutrition', kind: 'string' },
    { aliases: ['origin of place'], path: 'description.originOfPlace', kind: 'string' },
    { aliases: ['health benefit', 'health benefits'], path: 'description.healthBenefits', kind: 'string' },
    { aliases: ['product details', 'description'], path: '__productDetails', kind: 'string' },
    { aliases: ['wash & care', 'wash and care'], path: 'washAndCare', kind: 'string' },
    { aliases: ['shipping & returns', 'shipping and returns'], path: 'shippingAndReturns', kind: 'string' },
    { aliases: ['meta title'], path: 'meta.title', kind: 'string' },
    { aliases: ['meta keyword', 'meta keywords'], path: 'meta.keywords', kind: 'string' },
    { aliases: ['meta description'], path: 'meta.description', kind: 'string' },
    { aliases: ['shelf life', 'shelf life value'], path: 'shelfLife.value', kind: 'number' },
    { aliases: ['shelf life type'], path: 'shelfLife.type', kind: 'string' },
    { aliases: ['total shelf life'], path: 'shelfLife.total', kind: 'number' },
    { aliases: ['shelf life on receiving'], path: 'shelfLife.onReceiving', kind: 'number' },
    { aliases: ['shelf life on picking'], path: 'shelfLife.onPicking', kind: 'number' },
    { aliases: ['serial tracking'], path: 'serialTracking', kind: 'bool' },
    { aliases: ['stackable'], path: 'stackable', kind: 'bool' },
    { aliases: ['hazardous'], path: 'hazardous', kind: 'bool' },
    { aliases: ['poisonous'], path: 'poisonous', kind: 'bool' },
    { aliases: ['is purchasable'], path: 'isPurchasable', kind: 'bool' },
    { aliases: ['is saleable'], path: 'isSaleable', kind: 'bool' },
    { aliases: ['is stocked'], path: 'isStocked', kind: 'bool' },
    { aliases: ['lottable validation'], path: 'lottableValidation', kind: 'string' },
    { aliases: ['sku rotation'], path: 'skuRotation', kind: 'string' },
    { aliases: ['rotate by'], path: 'rotateBy', kind: 'string' },
    { aliases: ['recv. validation code', 'recv validation code'], path: 'recvValidationCode', kind: 'string' },
    { aliases: ['picking instructions'], path: 'pickingInstructions', kind: 'string' },
    { aliases: ['shipping instructions'], path: 'shippingInstructions', kind: 'string' },
    { aliases: ['threshold alert required'], path: 'thresholdAlertRequired', kind: 'bool' },
    { aliases: ['threshold qty'], path: 'thresholdQty', kind: 'number' },
    { aliases: ['shipping charges'], path: 'shippingCharges', kind: 'number' },
    { aliases: ['handling charges'], path: 'handlingCharges', kind: 'number' },
    { aliases: ['is ars applicable?', 'is ars applicable'], path: 'isArsApplicable', kind: 'bool' },
    { aliases: ['follow style'], path: 'followStyle', kind: 'string' },
    { aliases: ['ars calculation method'], path: 'arsCalculationMethod', kind: 'string' },
    { aliases: ['fixed stock'], path: 'fixedStock', kind: 'number' },
    { aliases: ['model stock'], path: 'modelStock', kind: 'number' },
    { aliases: ['sku uom', 'uom'], path: 'uom', kind: 'string' },
    { aliases: ['skuimgurl', 'sku img url', 'skuimg url'], path: 'imageUrl', kind: 'string' },
    { aliases: ['taxpercent', 'tax percent'], path: 'taxPercent', kind: 'number' },
    { aliases: ['sgst %'], path: 'taxBreakup.sgstPercent', kind: 'number' },
    { aliases: ['cgst %'], path: 'taxBreakup.cgstPercent', kind: 'number' },
    { aliases: ['igst %'], path: 'taxBreakup.igstPercent', kind: 'number' },
    { aliases: ['cess %'], path: 'taxBreakup.cessPercent', kind: 'number' },
    { aliases: ['sgst amount ₹', 'sgst amount'], path: 'taxBreakup.sgstAmount', kind: 'number' },
    { aliases: ['cgst amount ₹', 'cgst amount'], path: 'taxBreakup.cgstAmount', kind: 'number' },
    { aliases: ['igst amount ₹', 'igst amount'], path: 'taxBreakup.igstAmount', kind: 'number' },
    { aliases: ['cess amount ₹', 'cess amount'], path: 'taxBreakup.cessAmount', kind: 'number' },
    { aliases: ['price incl. gst ₹', 'price incl. gst'], path: 'taxBreakup.priceInclGst', kind: 'number' },
    { aliases: ['is unique barcode', 'is unique barcode.1'], path: 'isUniqueBarcode', kind: 'bool' },
  ];

  const map = new Map();
  for (const e of entries) {
    for (const a of e.aliases) {
      const k = normalizeHeaderKey(a);
      if (!map.has(k)) {
        map.set(k, { path: e.path, kind: e.kind });
      }
    }
  }
  return map;
}

const HEADER_PATH_MAP = buildHeaderPathMap();

const TAX_CATEGORY_NORM = normalizeHeaderKey('Tax Category');
const HSN_CODE_NORM = normalizeHeaderKey('HSN Code');

function normalizeClassification(val) {
  const t = String(val || '').trim();
  if (!t) return 'Style';
  if (t.toLowerCase() === 'varient') return 'Variant';
  if (t.toLowerCase() === 'variant') return 'Variant';
  return t;
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

function parseBoolean(raw, fallback = false) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (!t) return fallback;
  if (t === 'TRUE' || t === 'T' || t === 'Y' || t === 'YES' || t === '1') return true;
  if (t === 'FALSE' || t === 'F' || t === 'N' || t === 'NO' || t === '0') return false;
  return fallback;
}

function coerceValue(raw, kind) {
  switch (kind) {
    case 'price': {
      const p = parsePrice(raw);
      return p == null ? 0 : p;
    }
    case 'number':
      return parseNumberCell(raw, 0);
    case 'bool':
      return parseBoolean(raw, false);
    case 'classification': {
      const c = normalizeClassification(String(raw ?? '').trim());
      return c === 'Style' || c === 'Variant' ? c : 'Style';
    }
    case 'hsn':
      return String(raw ?? '').replace(/^'/, '').trim();
    case 'string':
    default:
      return String(raw ?? '').trim();
  }
}

function ensurePath(obj, pathParts) {
  let cur = obj;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const p = pathParts[i];
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  return cur;
}

function setDeep(obj, path, value) {
  const parts = path.split('.');
  if (parts.length === 1) {
    obj[parts[0]] = value;
    return;
  }
  const parent = ensurePath(obj, parts);
  parent[parts[parts.length - 1]] = value;
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
  const out = { about: '', nutrition: '', originOfPlace: '', healthBenefits: '', raw: raw };
  for (let i = 0; i < patterns.length; i += 1) {
    const current = patterns[i];
    const start = raw.indexOf(current.prefix);
    if (start === -1) continue;
    let end = raw.length;
    for (let j = i + 1; j < patterns.length; j += 1) {
      const nextPos = raw.indexOf(patterns[j].prefix, start + current.prefix.length);
      if (nextPos !== -1) end = Math.min(end, nextPos);
    }
    out[current.key] = raw.slice(start + current.prefix.length, end).trim();
  }
  if (!out.about && !out.nutrition && !out.originOfPlace && !out.healthBenefits) {
    out.about = raw;
  }
  return out;
}

function seedProductNestedDefaults(doc) {
  doc.description = {
    about: '',
    nutrition: '',
    originOfPlace: '',
    healthBenefits: '',
    raw: '',
    ...(typeof doc.description === 'object' && doc.description ? doc.description : {}),
  };
  doc.meta = {
    title: '',
    keywords: '',
    description: '',
    ...(typeof doc.meta === 'object' && doc.meta ? doc.meta : {}),
  };
  doc.udf = {
    udf1: '',
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
    udf6: '',
    udf7: '',
    udf8: '',
    udf9: '',
    udf10: '',
    ...(typeof doc.udf === 'object' && doc.udf ? doc.udf : {}),
  };
  doc.taxBreakup = {
    sgstPercent: 0,
    cgstPercent: 0,
    igstPercent: 0,
    cessPercent: 0,
    sgstAmount: 0,
    cgstAmount: 0,
    igstAmount: 0,
    cessAmount: 0,
    priceInclGst: 0,
    ...(typeof doc.taxBreakup === 'object' && doc.taxBreakup ? doc.taxBreakup : {}),
  };
  doc.dimensions = {
    heightCm: 0,
    lengthCm: 0,
    widthCm: 0,
    cube: 0,
    weightKg: 0,
    ...(typeof doc.dimensions === 'object' && doc.dimensions ? doc.dimensions : {}),
  };
  doc.shelfLife = {
    value: 0,
    type: '',
    total: 0,
    onReceiving: 0,
    onPicking: 0,
    ...(typeof doc.shelfLife === 'object' && doc.shelfLife ? doc.shelfLife : {}),
  };
}

/**
 * Apply mapped SKU Master columns to `doc` (mutates).
 */
function applySkuRowToProductDoc(doc, row, headerMap, io) {
  seedProductNestedDefaults(doc);
  let productDetailsRaw = '';
  /** Normalized header keys handled by schema mapping or image columns (see rebuildSkuMediaFromRow). */
  const consumedNorm = new Set();

  for (const [header, col] of headerMap.entries()) {
    const hTrim = String(header || '').trim();
    const norm = normalizeHeaderKey(header);
    if (/^skuimg\d+$/i.test(hTrim) || /^skuimgdesc\d+$/i.test(hTrim)) {
      consumedNorm.add(norm);
      continue;
    }

    const raw = io.getCellText(row, col);

    if (norm === TAX_CATEGORY_NORM || norm === HSN_CODE_NORM) {
      consumedNorm.add(norm);
      const v = String(raw ?? '').trim();
      doc.hsnCode = v.replace(/^'/, '');
      doc.taxCategory = v;
      continue;
    }

    const mapping = HEADER_PATH_MAP.get(norm);
    if (!mapping) {
      continue;
    }

    consumedNorm.add(norm);

    if (mapping.path === '__productDetails') {
      productDetailsRaw = raw;
      continue;
    }

    const coerced = coerceValue(raw, mapping.kind);
    setDeep(doc, mapping.path, coerced);
  }

  if (productDetailsRaw) {
    const parts = splitDescription(productDetailsRaw);
    const d = doc.description;
    for (const key of ['about', 'nutrition', 'originOfPlace', 'healthBenefits', 'raw']) {
      if (parts[key] && !d[key]) d[key] = parts[key];
    }
    if (parts.raw && !d.raw) d.raw = parts.raw;
  }

  doc.quantity = doc.size != null ? String(doc.size) : doc.quantity;

  const tb = doc.taxBreakup;
  const derivedPct =
    (Number(tb.sgstPercent) || 0) + (Number(tb.cgstPercent) || 0) + (Number(tb.igstPercent) || 0);
  const tp = Number(doc.taxPercent);
  if (!Number.isFinite(tp) || tp === 0) {
    if (derivedPct > 0) doc.taxPercent = derivedPct;
  }
  doc.gstRate = Number(doc.taxPercent) || 0;

  if (doc.fixedStock != null && doc.fixedStock !== '') {
    doc.stockQuantity = parseNumberCell(doc.fixedStock, 0);
  }
  const tq = Number(doc.thresholdQty);
  if (Number.isFinite(tq) && tq > 0) {
    doc.lowStockThreshold = tq;
  } else if (doc.lowStockThreshold == null || doc.lowStockThreshold === undefined) {
    doc.lowStockThreshold = 10;
  }

  if (!doc.countryOfOrigin) doc.countryOfOrigin = 'India';

  doc.originalPrice = doc.mrp;
  const bc = Number(doc.baseCost);
  doc.costPrice = Number.isFinite(bc) ? bc : 0;

  /** Headers with no dedicated path (future-proofing / typos). Keys = exact sheet title. */
  const extra = {};
  for (const [header, col] of headerMap.entries()) {
    const norm = normalizeHeaderKey(header);
    if (consumedNorm.has(norm)) continue;
    const raw = io.getCellText(row, col);
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    extra[header] = String(raw).trim();
  }
  doc.additionalImportedFields = extra;
}

/** Split SKUimgURL / manual entry: comma, semicolon, or newline; trim; preserve order; dedupe later in merge. */
function parseCommaSeparatedImageUrls(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Apply the requested optimization query params to an image URL.
 * Only used for URLs sourced from the SKU Master `SKUimgURL` column.
 */
function applySkuImgUrlParams(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!u) return '';
  try {
    const url = new URL(u);
    url.searchParams.set('q', '40');
    url.searchParams.set('w', '400');
    return url.toString();
  } catch {
    // Fallback for non-absolute URLs: append params safely.
    const joiner = u.includes('?') ? '&' : '?';
    return `${u}${joiner}q=40&w=400`;
  }
}

function rebuildSkuMediaFromRow(doc, row, headerMap, getCellText) {
  // SKUimgURL → doc.imageUrl via header mapping; apply params only for these URLs.
  const fromPrimaryCell = parseCommaSeparatedImageUrls(doc.imageUrl).map(applySkuImgUrlParams);

  const extras = [];
  for (const [h, col] of headerMap.entries()) {
    if (/^skuimg\d+$/i.test(String(h).trim())) {
      const cellRaw = getCellText(row, col);
      if (!cellRaw) continue;
      const n = parseInt(String(h).replace(/^\D+/g, ''), 10) || 0;
      for (const u of parseCommaSeparatedImageUrls(cellRaw)) {
        extras.push({ n, u });
      }
    }
  }
  extras.sort((a, b) => a.n - b.n);
  const columnUrls = extras.map((e) => e.u);

  const merged = [];
  const seen = new Set();
  const add = (u) => {
    const t = String(u || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    merged.push(t);
  };
  for (const u of fromPrimaryCell) add(u);
  for (const u of columnUrls) add(u);

  const primary = merged[0] || '';
  doc.imageUrl = primary;
  doc.additionalImages = merged.slice(1);
  doc.images = merged.filter(Boolean);

  const descs = [];
  for (const [h, col] of headerMap.entries()) {
    if (/^skuimgdesc\d+$/i.test(String(h).trim())) {
      const t = getCellText(row, col);
      const n = parseInt(String(h).replace(/^\D+/g, ''), 10) || 0;
      if (t) descs.push({ n, t });
    }
  }
  descs.sort((a, b) => a.n - b.n);
  doc.imageDescriptions = descs.map((d) => d.t);
}

module.exports = {
  normalizeHeaderKey,
  HEADER_PATH_MAP,
  applySkuRowToProductDoc,
  rebuildSkuMediaFromRow,
  parseCommaSeparatedImageUrls,
  splitDescription,
  parsePrice,
  parseBoolean,
  parseNumberCell,
};
