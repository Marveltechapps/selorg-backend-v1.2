/**
 * Multilingual product search service.
 * Supports English, Tamil, Tanglish, and Hindi via expanded keywords,
 * MongoDB text index, prefix/partial matching, and fuzzy ranking.
 */

const {
  expandSearchQuery,
  buildTextSearchString,
  escapeRegex,
  normalizeSearchToken,
  isFuzzyMatch,
  generateFuzzyVariants,
  tokenizeQuery,
} = require('./searchNormalization');

function isTextIndexUnavailableError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err?.code === 27 || msg.includes('text index') || msg.includes('no text index');
}

/**
 * Build regex conditions for partial/prefix matching on search fields.
 * @param {string} query
 * @param {string[]} expandedTerms
 */
function buildPartialMatchConditions(query, expandedTerms) {
  const conditions = [];
  const qNorm = normalizeSearchToken(query);
  const allTerms = [...new Set([query, qNorm, ...expandedTerms].filter(Boolean))];

  for (const term of allTerms) {
    if (!term || term.length < 1) continue;
    const escaped = escapeRegex(term);
    const prefixPattern = new RegExp(`(^|\\s)${escaped}`, 'i');
    conditions.push({ searchKeywordsNormalized: prefixPattern });
    conditions.push({ searchKeywords: new RegExp(`^${escaped}`, 'i') });
    conditions.push({ name: new RegExp(escaped, 'i') });
    conditions.push({ brand: new RegExp(escaped, 'i') });
    conditions.push({ tag: new RegExp(escaped, 'i') });
    conditions.push({ sku: new RegExp(escaped, 'i') });
  }

  // Fuzzy variants for typo tolerance
  for (const variant of generateFuzzyVariants(query)) {
    const escaped = escapeRegex(variant);
    conditions.push({ searchKeywordsNormalized: new RegExp(`(^|\\s)${escaped}`, 'i') });
    conditions.push({ searchKeywords: new RegExp(`^${escaped}`, 'i') });
  }

  return conditions;
}

/**
 * Compute relevance score for ranking (higher = better match).
 * @param {object} product
 * @param {string} query
 * @param {string[]} expandedTerms
 * @param {number} [textScore]
 */
function computeRelevanceScore(product, query, expandedTerms, textScore = 0) {
  let score = textScore * 10;
  const qNorm = normalizeSearchToken(query);
  const nameNorm = normalizeSearchToken(product.name || '');
  const keywords = Array.isArray(product.searchKeywords) ? product.searchKeywords : [];

  // Exact name match (highest priority)
  if (nameNorm === qNorm) score += 1000;
  else if (nameNorm.startsWith(qNorm)) score += 500;
  else if (nameNorm.includes(qNorm)) score += 200;

  // Exact keyword match
  for (const kw of keywords) {
    const kwNorm = normalizeSearchToken(kw);
    if (kwNorm === qNorm) {
      // English keyword exact match
      if (/^[a-z0-9\s]+$/i.test(kw) && !/[\u0B80-\u0BFF\u0900-\u097F]/.test(kw)) {
        score += 800;
      } else if (/[\u0B80-\u0BFF]/.test(kw)) {
        score += 600; // Tamil
      } else if (/[\u0900-\u097F]/.test(kw)) {
        score += 500; // Hindi
      } else {
        score += 700; // Tanglish / romanized
      }
      break;
    }
    if (kwNorm.startsWith(qNorm)) score += 300;
    else if (kwNorm.includes(qNorm)) score += 100;
  }

  // Expanded term matches (transliteration)
  for (const term of expandedTerms) {
    const termNorm = normalizeSearchToken(term);
    if (!termNorm || termNorm === qNorm) continue;
    if (nameNorm.includes(termNorm)) score += 150;
    for (const kw of keywords) {
      if (normalizeSearchToken(kw) === termNorm) score += 120;
    }
  }

  // SKU exact/prefix
  const skuNorm = normalizeSearchToken(product.sku || '');
  if (skuNorm && (skuNorm === qNorm || skuNorm.startsWith(qNorm))) score += 400;

  // Brand match
  const brandNorm = normalizeSearchToken(product.brand || '');
  if (brandNorm && brandNorm.includes(qNorm)) score += 80;

  // Fuzzy match bonus
  for (const kw of keywords) {
    if (isFuzzyMatch(query, kw)) {
      score += 50;
      break;
    }
  }

  // Prefer lower sortOrder (merchandising)
  const sortOrder = Number(product.sortOrder ?? product.order ?? 9999);
  score -= sortOrder * 0.01;

  return score;
}

/**
 * Rank and dedupe search results by relevance.
 * @param {object[]} products
 * @param {string} query
 * @param {string[]} expandedTerms
 * @param {Map<string, number>} [textScores]
 */
function rankSearchResults(products, query, expandedTerms, textScores = new Map()) {
  const scored = products.map((p) => {
    const id = String(p._id);
    const textScore = textScores.get(id) || 0;
    return {
      product: p,
      score: computeRelevanceScore(p, query, expandedTerms, textScore),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.product);
}

/**
 * Run multilingual product search.
 * @param {import('mongoose').Model} Product
 * @param {string} query
 * @param {object} baseFilter
 * @param {number} skip
 * @param {number} limit
 */
async function runMultilingualProductSearch(Product, query, baseFilter, skip, limit) {
  const expandedTerms = expandSearchQuery(query);
  const textSearchStr = buildTextSearchString(expandedTerms);

  let candidateProducts = [];
  let total = 0;
  const textScores = new Map();

  // Strategy 1: MongoDB $text search (fast, indexed)
  if (textSearchStr.trim()) {
    try {
      const textFilter = { ...baseFilter, $text: { $search: textSearchStr } };
      const textResults = await Product.find(textFilter, { score: { $meta: 'textScore' } })
        .select({ baseCost: 0 })
        .sort({ score: { $meta: 'textScore' } })
        .limit(Math.max(limit * 3, 60))
        .maxTimeMS(250)
        .lean();

      for (const p of textResults) {
        textScores.set(String(p._id), p.score || 0);
      }
      candidateProducts.push(...textResults);
    } catch (err) {
      if (!isTextIndexUnavailableError(err)) throw err;
    }
  }

  // Strategy 2: Partial/prefix regex — skip when text search already returned a full candidate set
  const needPartial =
    candidateProducts.length < Math.max(limit, 12) || String(query || '').trim().length <= 3;
  const partialConditions = needPartial ? buildPartialMatchConditions(query, expandedTerms) : [];
  if (partialConditions.length > 0) {
    const partialFilter = { ...baseFilter, $or: partialConditions };
    const partialResults = await Product.find(partialFilter)
      .select({ baseCost: 0 })
      .limit(Math.max(limit * 3, 60))
      .maxTimeMS(250)
      .lean();
    candidateProducts.push(...partialResults);
  }

  // Dedupe by _id
  const seen = new Set();
  const unique = [];
  for (const p of candidateProducts) {
    const id = String(p._id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(p);
  }

  // Rank by relevance
  const ranked = rankSearchResults(unique, query, expandedTerms, textScores);

  // If no results, try broader fuzzy fallback on name/tag only
  if (ranked.length === 0 && query.length >= 2) {
    const qNorm = normalizeSearchToken(query);
    const fuzzyFilter = {
      ...baseFilter,
      $or: [
        { name: new RegExp(escapeRegex(qNorm), 'i') },
        { tag: new RegExp(escapeRegex(qNorm), 'i') },
        { brand: new RegExp(escapeRegex(qNorm), 'i') },
        { 'description.about': new RegExp(escapeRegex(qNorm), 'i') },
      ],
    };
    const fuzzyResults = await Product.find(fuzzyFilter)
      .select({ baseCost: 0 })
      .limit(Math.max(limit * 2, 40))
      .lean();
    const fuzzyRanked = rankSearchResults(fuzzyResults, query, expandedTerms);
    total = fuzzyRanked.length;
    return {
      rawProducts: fuzzyRanked.slice(skip, skip + limit),
      total,
    };
  }

  total = ranked.length;
  return {
    rawProducts: ranked.slice(skip, skip + limit),
    total,
  };
}

/**
 * Run search suggestions with multilingual support.
 * @param {import('mongoose').Model} Product
 * @param {string} query
 * @param {number} [limit]
 */
async function runMultilingualSearchSuggestions(Product, query, limit = 5) {
  const baseFilter = {
    isActive: true,
    isSaleable: true,
    classification: 'Style',
  };

  const expandedTerms = expandSearchQuery(query);
  const textSearchStr = buildTextSearchString(expandedTerms);
  let candidates = [];
  const textScores = new Map();

  if (textSearchStr.trim()) {
    try {
      const textFilter = { ...baseFilter, $text: { $search: textSearchStr } };
      const textResults = await Product.find(textFilter, { score: { $meta: 'textScore' } })
        .select({ name: 1, imageUrl: 1, sku: 1, size: 1, searchKeywords: 1, sortOrder: 1, order: 1, brand: 1 })
        .sort({ score: { $meta: 'textScore' } })
        .limit(20)
        .maxTimeMS(200)
        .lean();
      for (const p of textResults) {
        textScores.set(String(p._id), p.score || 0);
      }
      candidates.push(...textResults);
    } catch (err) {
      if (!isTextIndexUnavailableError(err)) throw err;
    }
  }

  const partialConditions = buildPartialMatchConditions(query, expandedTerms);
  if (partialConditions.length > 0) {
    const partialResults = await Product.find({ ...baseFilter, $or: partialConditions })
      .select({ name: 1, imageUrl: 1, sku: 1, size: 1, searchKeywords: 1, sortOrder: 1, order: 1, brand: 1 })
      .limit(20)
      .maxTimeMS(200)
      .lean();
    candidates.push(...partialResults);
  }

  // Fallback: simple name prefix
  if (candidates.length === 0) {
    const escaped = escapeRegex(query);
    const fallback = await Product.find({
      ...baseFilter,
      name: new RegExp(escaped, 'i'),
    })
      .select({ name: 1, imageUrl: 1, sku: 1, size: 1, searchKeywords: 1, sortOrder: 1, order: 1, brand: 1 })
      .limit(limit)
      .maxTimeMS(100)
      .lean();
    return fallback;
  }

  const seen = new Set();
  const unique = [];
  for (const p of candidates) {
    const id = String(p._id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(p);
  }

  const ranked = rankSearchResults(unique, query, expandedTerms, textScores);
  return ranked.slice(0, limit);
}

/**
 * Build admin search filter with multilingual keyword support.
 * @param {string} search
 * @returns {object|null}
 */
function buildAdminSearchFilter(search) {
  const q = String(search || '').trim();
  if (!q) return null;

  const expandedTerms = expandSearchQuery(q);
  const conditions = buildPartialMatchConditions(q, expandedTerms);

  // Also add description regex
  const escaped = escapeRegex(q);
  conditions.push({ description: new RegExp(escaped, 'i') });
  conditions.push({ 'description.about': new RegExp(escaped, 'i') });

  return { $or: conditions };
}

module.exports = {
  runMultilingualProductSearch,
  runMultilingualSearchSuggestions,
  buildAdminSearchFilter,
  computeRelevanceScore,
  rankSearchResults,
  buildPartialMatchConditions,
  isTextIndexUnavailableError,
};
