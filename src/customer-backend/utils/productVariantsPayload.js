const { Product } = require('../models/Product');

/**
 * Normalize a catalog title for "same product, different pack size" grouping.
 * Strips trailing weight / pack / container fragments so e.g.
 * "Masala - 100g", "Masala - 250g", "Sunflower Oil - 250ml Bottle", and
 * "Sunflower Oil - 1ltr Bottle" all collapse to the same line.
 */
function productBaseName(name) {
  if (name == null || typeof name !== 'string') return '';
  let s = name.trim().replace(/\s+/g, ' ');
  // "500g * 3 - Multipack" / "1 * 3 bundle" style tails
  s = s.replace(
    /\s*[-–—]?\s*\d+(\.\d+)?\s*(g|kg|ml|mL|l|L|ltr|lt|pc|pcs)?\s*\*\s*\d+(\s*[-–—]\s*)?(multipack|bundle|pack)?\s*$/i,
    ''
  ).trim();
  // " - 250ml Bottle" / "-500ml pouch" / " 1ltr Jar"
  s = s.replace(
    /\s*[-–—]?\s*\d+(\.\d+)?\s*(g|kg|ml|mL|l|L|ltr|lt|pc|pcs|pack)\b(\s*(bottle|pouch|jar|tin|can|tub|pack|multipack|bundle))?\s*$/i,
    ''
  ).trim();
  // Trailing bare container word left after size strip (e.g. "Oil Bottle")
  s = s.replace(/\s+(bottle|pouch|jar|tin|can|tub|multipack|bundle)\s*$/i, '').trim();
  // Normalize "Oil-" / "Oil -" leftovers
  s = s.replace(/\s*[-–—]+\s*$/g, '').trim();
  return s.toLowerCase();
}

/**
 * Key for carousel / similar-products dedupe: same pack SKUs often differ only by a leading brand word
 * ("Nagarathar Turmeric Powder" vs "Turmeric Powder") and must show as one card with variants.
 */
function productLineDedupeKey(name) {
  const base = productBaseName(name);
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return parts.slice(1).join(' ');
  }
  return base;
}

/**
 * `hierarchyCode` is often shared too broadly in data; only treat docs as size-SKUs of the same
 * product when their base names match (e.g. exclude Turmeric vs Chilli that share a code).
 */
function filterHierarchySiblingsForProductLine(product, siblings) {
  if (!Array.isArray(siblings) || siblings.length === 0) return [];
  const key = productBaseName(product.name);
  if (!key) return siblings;
  const filtered = siblings.filter((s) => productBaseName(s.name) === key);
  if (filtered.length === 0) {
    return [product];
  }
  return filtered;
}

/**
 * One carousel / grid row per catalog product line (same base title, different pack SKUs).
 * Uses `hierarchyCode` + normalized line when present so multiple Product docs for the same
 * family (e.g. three Turmeric SKUs sharing a code) collapse to one card with variants.
 * @param {number} [maxCount] - optional cap after dedupe (e.g. similar products = 8).
 */
function dedupeProductsByBaseName(products, maxCount) {
  if (!Array.isArray(products) || products.length === 0) return products;
  const seen = new Set();
  const out = [];
  for (const p of products) {
    if (!p) continue;
    const line = productLineDedupeKey(p.name);
    const code = p.hierarchyCode && String(p.hierarchyCode).trim();
    const k = code ? `h:${code}::${line || String(p._id)}` : line || `__id:${String(p._id)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (typeof maxCount === 'number' && maxCount > 0 && out.length >= maxCount) break;
  }
  return out;
}

/**
 * Ensure a stable, client-friendly image order.
 * Rule: if `imageUrl` exists, it MUST be index 0. Remaining URLs preserve order.
 */
function normalizeImagesForClient(p) {
  const primary = typeof p?.imageUrl === 'string' ? p.imageUrl.trim() : '';
  const urls = [];
  if (primary) urls.push(primary);
  if (Array.isArray(p?.images)) {
    for (const u of p.images) {
      if (typeof u === 'string' && u.trim()) urls.push(u.trim());
    }
  }
  if (Array.isArray(p?.additionalImages)) {
    for (const u of p.additionalImages) {
      if (typeof u === 'string' && u.trim()) urls.push(u.trim());
    }
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Media fields so each variant row can show the correct SKU image (esp. hierarchy siblings). */
function pickImageFields(p) {
  if (!p) return {};
  const o = {
    imageUrl: p.imageUrl || '',
    thumbnailUrl: p.thumbnailUrl || '',
    cardImageUrl: p.cardImageUrl || '',
  };
  o.images = normalizeImagesForClient(p);
  return o;
}

/**
 * Map embedded subdocuments on a Style product to API variant rows.
 * @returns {Array<{ id: string, productId: string, size: string, price: number, originalPrice: number }>}
 */
function mapEmbeddedVariants(product) {
  const pid = String(product._id);
  const out = [];
  if (!Array.isArray(product.variants) || product.variants.length === 0) return out;
  const media = pickImageFields(product);
  for (let i = 0; i < product.variants.length; i += 1) {
    const v = product.variants[i];
    const id = v._id != null ? String(v._id) : `${pid}-v${i}`;
    const price = typeof v.price === 'number' ? v.price : Number(product.price || 0);
    const originalPrice =
      typeof v.originalPrice === 'number'
        ? v.originalPrice
        : Number(v.mrp ?? product.mrp ?? product.originalPrice ?? product.price ?? 0);
    out.push({
      id,
      productId: pid,
      name: product.name,
      size: String(v.size || v.sku || '').trim() || '1 unit',
      price,
      originalPrice,
      ...media,
    });
  }
  return out;
}

function singleVariantFallback(p) {
  const pid = String(p._id);
  return [
    {
      id: pid,
      productId: pid,
      name: p.name,
      size: String(p.size || p.quantity || '').trim() || '1 unit',
      price: Number(p.price || 0),
      originalPrice: Number(p.mrp ?? p.originalPrice ?? p.price ?? 0),
      ...pickImageFields(p),
    },
  ];
}

/**
 * Attach normalized `variants` to each product for list/carousel/search payloads.
 * - Multiple embedded variant rows on the Style document → use those as-is.
 * - If embedded has 0 or 1 row but `hierarchyCode` exists → resolve sibling SKUs (same product line).
 * - Otherwise a single synthetic variant using the product id (cart-compatible).
 *
 * A single embedded row often duplicates the default size; real multi-size SKUs may live as
 * separate Product docs under the same code — do not let one embedded row block hierarchy expansion.
 */
async function enrichProductsWithVariants(products, options = {}) {
  const dedupeLines = options.dedupeProductLines !== false;
  let list = Array.isArray(products) ? products : [];
  if (dedupeLines && list.length > 0) {
    const max = typeof options.maxProductLines === 'number' ? options.maxProductLines : undefined;
    list = dedupeProductsByBaseName(list, max);
  }
  if (!Array.isArray(list) || list.length === 0) return list;

  const enriched = list.map((p) => ({ ...p }));
  const needHierarchy = [];

  for (let i = 0; i < enriched.length; i += 1) {
    const p = enriched[i];
    const emb = mapEmbeddedVariants(p);
    if (emb.length > 1) {
      p.variants = emb;
    } else if (p.hierarchyCode && String(p.hierarchyCode).trim()) {
      needHierarchy.push({ index: i, code: String(p.hierarchyCode).trim() });
    } else if (emb.length === 1) {
      p.variants = emb;
    } else {
      p.variants = singleVariantFallback(p);
    }
  }

  if (needHierarchy.length === 0) return enriched;

  const uniqueCodes = [...new Set(needHierarchy.map((x) => x.code))];
  const siblings = await Product.find({
    hierarchyCode: { $in: uniqueCodes },
    isActive: true,
    isSaleable: true,
  })
    .select({
      _id: 1,
      name: 1,
      hierarchyCode: 1,
      size: 1,
      quantity: 1,
      price: 1,
      mrp: 1,
      originalPrice: 1,
      imageUrl: 1,
      thumbnailUrl: 1,
      cardImageUrl: 1,
      images: 1,
    })
    .lean();

  const byCode = new Map();
  for (const s of siblings) {
    const code = String(s.hierarchyCode || '');
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(s);
  }

  for (const { index, code } of needHierarchy) {
    const rawGroup = byCode.get(code) || [];
    const p = enriched[index];
    const group = filterHierarchySiblingsForProductLine(p, rawGroup);
    if (group.length === 0) {
      p.variants = singleVariantFallback(p);
      continue;
    }
    if (group.length === 1) {
      const s = group[0];
      const sid = String(s._id);
      p.variants = [
        {
          id: sid,
          productId: sid,
          name: s.name,
          size: String(s.size || s.quantity || p.size || p.quantity || '').trim() || '1 unit',
          price: Number(s.price ?? p.price ?? 0),
          originalPrice: Number(s.mrp ?? s.originalPrice ?? p.mrp ?? p.originalPrice ?? p.price ?? 0),
          ...pickImageFields(s),
        },
      ];
      continue;
    }
    p.variants = group.map((s) => {
      const sid = String(s._id);
      return {
        id: sid,
        productId: sid,
        name: s.name,
        size: String(s.size || s.quantity || '').trim() || '1 unit',
        price: Number(s.price ?? 0),
        originalPrice: Number(s.mrp ?? s.originalPrice ?? s.price ?? 0),
        ...pickImageFields(s),
      };
    });
  }

  return enriched;
}

/**
 * Customer list/home APIs only render `classification: 'Style'` cards.
 * Home Page Content / collections often list Variant SKUs — map each id to the
 * Style sibling for the same hierarchy + product line (preserving sheet order).
 *
 * @param {Array<string|import('mongoose').Types.ObjectId>} productIds
 * @returns {Promise<string[]>} Style product ObjectId strings (deduped, ordered)
 */
async function mapProductIdsToStyleIds(productIds = []) {
  if (!Array.isArray(productIds) || productIds.length === 0) return [];
  const uniqueIds = [...new Set(productIds.map((id) => String(id)).filter(Boolean))];
  const docs = await Product.find({ _id: { $in: uniqueIds } })
    .select('_id classification hierarchyCode name')
    .lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const variantsNeedingStyle = [];
  for (const id of uniqueIds) {
    const d = byId.get(id);
    if (!d) continue;
    if (d.classification === 'Style') continue;
    if (d.hierarchyCode && String(d.hierarchyCode).trim()) variantsNeedingStyle.push(d);
  }

  const styleByLine = new Map();
  const codes = [
    ...new Set(variantsNeedingStyle.map((d) => String(d.hierarchyCode).trim()).filter(Boolean)),
  ];
  if (codes.length > 0) {
    const styles = await Product.find({
      hierarchyCode: { $in: codes },
      classification: 'Style',
      isActive: true,
      isSaleable: true,
    })
      .select('_id hierarchyCode name')
      .lean();
    for (const s of styles) {
      const key = `${String(s.hierarchyCode).trim()}::${productBaseName(s.name)}`;
      if (!styleByLine.has(key)) styleByLine.set(key, String(s._id));
    }
  }

  const out = [];
  const seen = new Set();
  for (const id of productIds.map((x) => String(x))) {
    const d = byId.get(id);
    if (!d) continue;
    let styleId = String(d._id);
    if (d.classification !== 'Style') {
      const key = `${String(d.hierarchyCode || '').trim()}::${productBaseName(d.name)}`;
      const mapped = styleByLine.get(key);
      if (!mapped) continue;
      styleId = mapped;
    }
    if (seen.has(styleId)) continue;
    seen.add(styleId);
    out.push(styleId);
  }
  return out;
}

module.exports = {
  mapEmbeddedVariants,
  enrichProductsWithVariants,
  singleVariantFallback,
  pickImageFields,
  normalizeImagesForClient,
  productBaseName,
  productLineDedupeKey,
  filterHierarchySiblingsForProductLine,
  dedupeProductsByBaseName,
  mapProductIdsToStyleIds,
};
