/**
 * Generate multilingual search keywords for products during import and updates.
 */

const {
  findCanonicalTermsInText,
  getKeywordsForCanonical,
  normalizeDictKey,
} = require('./groceryKeywordDictionary');
const { normalizeSearchToken } = require('./searchNormalization');

const CATEGORY_KEYWORD_ALIASES = {
  vegetables: ['vegetable', 'vegetables', 'veggies', 'veg', 'காய்கறி', 'kaikari', 'sabzi', 'सब्जी'],
  fruits: ['fruit', 'fruits', 'பழம்', 'pazham', 'phal', 'फल'],
  dairy: ['dairy', 'milk products', 'பால் பொருட்கள்', 'doodh', 'दूध'],
  beverages: ['beverage', 'beverages', 'drinks', 'பானங்கள்', 'drinks'],
  snacks: ['snack', 'snacks', 'சிற்றுண்டி', 'nashta', 'नाश्ता'],
  staples: ['staples', 'groceries', 'பண்டங்கள்', 'kirana', 'किराना'],
  'personal care': ['personal care', 'hygiene', 'பொருட்பொருள்'],
  household: ['household', 'home care', 'வீட்டு பொருட்கள்'],
};

/**
 * Split meta keywords string into individual terms.
 * @param {string|undefined|null} raw
 * @returns {string[]}
 */
function splitMetaKeywords(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract meaningful tokens from product name (skip size/quantity patterns).
 * @param {string} name
 * @returns {string[]}
 */
function tokenizeProductName(name) {
  const cleaned = String(name || '')
    .replace(/\b\d+(\.\d+)?\s*(kg|g|gm|gms|ml|l|ltr|litre|liter|pack|pcs|pc|nos|no)\b/gi, ' ')
    .replace(/\b\d+\s*x\s*\d+\b/gi, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .trim();
  return cleaned
    .split(/[\s,;/+|&-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Build search keywords array from product document fields.
 * @param {object} product - Product fields (name, brand, tag, sku, meta, categoryName, etc.)
 * @returns {{ searchKeywords: string[], searchKeywordsNormalized: string }}
 */
function generateProductSearchKeywords(product) {
  const keywords = new Set();

  const name = String(product.name || '').trim();
  const brand = String(product.brand || '').trim();
  const tag = String(product.tag || '').trim();
  const sku = String(product.sku || '').trim();
  const categoryName = String(product.categoryName || '').trim();
  const subcategoryName = String(product.subcategoryName || '').trim();

  if (name) {
    keywords.add(name);
    keywords.add(name.toLowerCase());
    for (const token of tokenizeProductName(name)) {
      keywords.add(token);
      keywords.add(token.toLowerCase());
    }
  }

  if (brand) {
    keywords.add(brand);
    keywords.add(brand.toLowerCase());
  }

  if (tag) {
    keywords.add(tag);
    keywords.add(tag.toLowerCase());
  }

  if (sku) {
    keywords.add(sku);
    keywords.add(sku.toLowerCase());
  }

  for (const mk of splitMetaKeywords(product.meta?.keywords)) {
    keywords.add(mk);
    keywords.add(mk.toLowerCase());
  }

  if (Array.isArray(product.tags)) {
    for (const t of product.tags) {
      if (t) {
        keywords.add(String(t));
        keywords.add(String(t).toLowerCase());
      }
    }
  }

  if (categoryName) {
    keywords.add(categoryName);
    keywords.add(categoryName.toLowerCase());
    const catNorm = normalizeDictKey(categoryName);
    const catAliases = CATEGORY_KEYWORD_ALIASES[catNorm];
    if (catAliases) {
      for (const a of catAliases) keywords.add(a);
    }
    const catCanonicals = findCanonicalTermsInText(categoryName);
    for (const c of catCanonicals) {
      for (const kw of getKeywordsForCanonical(c)) keywords.add(kw);
    }
  }

  if (subcategoryName) {
    keywords.add(subcategoryName);
    keywords.add(subcategoryName.toLowerCase());
  }

  // Dictionary-based multilingual expansion from product name, tag, category
  const textForDict = [name, tag, categoryName, subcategoryName, brand].filter(Boolean).join(' ');
  const canonicals = findCanonicalTermsInText(textForDict);
  for (const canonical of canonicals) {
    for (const kw of getKeywordsForCanonical(canonical)) {
      keywords.add(kw);
    }
  }

  // Also check individual name tokens against dictionary
  for (const token of tokenizeProductName(name)) {
    const tokenCanonicals = findCanonicalTermsInText(token);
    for (const canonical of tokenCanonicals) {
      for (const kw of getKeywordsForCanonical(canonical)) {
        keywords.add(kw);
      }
    }
  }

  const searchKeywords = [...keywords]
    .map((k) => String(k).trim())
    .filter((k) => k.length > 0);

  const normalizedParts = searchKeywords.map((k) => normalizeSearchToken(k)).filter(Boolean);
  const searchKeywordsNormalized = [...new Set(normalizedParts)].join(' ');

  return { searchKeywords, searchKeywordsNormalized };
}

/**
 * Apply generated search keywords to a product document (mutates).
 * @param {object} doc
 * @param {{ categoryName?: string, subcategoryName?: string }} [context]
 */
function applySearchKeywordsToDoc(doc, context = {}) {
  const { searchKeywords, searchKeywordsNormalized } = generateProductSearchKeywords({
    name: doc.name,
    brand: doc.brand,
    tag: doc.tag,
    sku: doc.sku,
    meta: doc.meta,
    tags: doc.tags,
    categoryName: context.categoryName,
    subcategoryName: context.subcategoryName,
  });
  doc.searchKeywords = searchKeywords;
  doc.searchKeywordsNormalized = searchKeywordsNormalized;
}

/**
 * Regenerate search keywords using category names resolved from IDs.
 * @param {object} doc
 * @param {import('mongoose').Model} Category
 * @param {{ session?: object, categoryNameCache?: Map<string, string> }} [opts]
 */
async function applySearchKeywordsWithCategories(doc, Category, opts = {}) {
  const { session, categoryNameCache } = opts;

  async function resolveName(id) {
    if (!id) return '';
    const key = String(id);
    if (categoryNameCache?.has(key)) return categoryNameCache.get(key);
    const q = Category.findById(id).select('name').lean();
    if (session) q.session(session);
    const cat = await q;
    const name = cat?.name || '';
    categoryNameCache?.set(key, name);
    return name;
  }

  const categoryName = await resolveName(doc.categoryId);
  const subcategoryName = await resolveName(doc.subcategoryId);
  applySearchKeywordsToDoc(doc, { categoryName, subcategoryName });
}

module.exports = {
  generateProductSearchKeywords,
  applySearchKeywordsToDoc,
  applySearchKeywordsWithCategories,
  splitMetaKeywords,
  tokenizeProductName,
  CATEGORY_KEYWORD_ALIASES,
};
