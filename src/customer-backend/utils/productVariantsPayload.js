const { Product } = require('../models/Product');

/**
 * Normalize a catalog title for "same product, different pack size" grouping.
 * Strips trailing weight / pack fragments so e.g. "Masala - 100g" and "Masala - 250g" match.
 */
function productBaseName(name) {
  if (name == null || typeof name !== 'string') return '';
  let s = name.trim().replace(/\s+/g, ' ');
  s = s.replace(/\s*[-–—]\s*\d+(\.\d+)?\s*(g|kg|ml|mL|l|L|pc|pcs|pack)\b\s*$/i, '').trim();
  s = s.replace(/\s+\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)\s*$/i, '').trim();
  return s.toLowerCase();
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

/** Media fields so each variant row can show the correct SKU image (esp. hierarchy siblings). */
function pickImageFields(p) {
  if (!p) return {};
  const o = {
    imageUrl: p.imageUrl || '',
    thumbnailUrl: p.thumbnailUrl || '',
    cardImageUrl: p.cardImageUrl || '',
  };
  if (Array.isArray(p.images) && p.images.length > 0) {
    o.images = p.images;
  }
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
async function enrichProductsWithVariants(products) {
  if (!Array.isArray(products) || products.length === 0) return products;

  const enriched = products.map((p) => ({ ...p }));
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

module.exports = {
  mapEmbeddedVariants,
  enrichProductsWithVariants,
  singleVariantFallback,
  pickImageFields,
  productBaseName,
  filterHierarchySiblingsForProductLine,
};
