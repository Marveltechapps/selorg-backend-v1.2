/**
 * Search text normalization and query expansion utilities.
 */

const { expandTermToKeywords, normalizeDictKey } = require('./groceryKeywordDictionary');

/**
 * Normalize a search token for matching (lowercase, accent-stripped, punctuation removed).
 * Preserves Tamil (U+0B80–U+0BFF) and Devanagari (U+0900–U+097F) scripts.
 * @param {string} value
 * @returns {string}
 */
function normalizeSearchToken(value) {
  return normalizeDictKey(value);
}

/**
 * Escape special regex characters.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect if text contains Tamil script.
 * @param {string} text
 */
function hasTamilScript(text) {
  return /[\u0B80-\u0BFF]/.test(text);
}

/**
 * Detect if text contains Devanagari (Hindi) script.
 * @param {string} text
 */
function hasDevanagariScript(text) {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Detect if text is primarily Latin/romanized.
 * @param {string} text
 */
function isRomanized(text) {
  return /[a-z]/i.test(text) && !hasTamilScript(text) && !hasDevanagariScript(text);
}

/**
 * Split a search query into tokens.
 * @param {string} query
 * @returns {string[]}
 */
function tokenizeQuery(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  return q
    .split(/[\s,;/+|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Expand a full search query into multilingual search terms (deduped).
 * @param {string} query
 * @returns {string[]}
 */
function expandSearchQuery(query) {
  const tokens = tokenizeQuery(query);
  const expanded = new Set();
  const originalNorm = normalizeSearchToken(query);
  if (originalNorm) expanded.add(originalNorm);

  for (const token of tokens) {
    const norm = normalizeSearchToken(token);
    if (norm) expanded.add(norm);
    const variants = expandTermToKeywords(token);
    for (const v of variants) {
      const vn = normalizeSearchToken(v);
      if (vn) expanded.add(vn);
      expanded.add(v);
    }
  }

  // Whole-query expansion for single-token transliterated queries
  if (tokens.length === 1) {
    const wholeVariants = expandTermToKeywords(query);
    for (const v of wholeVariants) {
      expanded.add(v);
      const vn = normalizeSearchToken(v);
      if (vn) expanded.add(vn);
    }
  }

  return [...expanded].filter(Boolean);
}

/**
 * Build a MongoDB-safe $text search string from expanded terms.
 * @param {string[]} terms
 * @returns {string}
 */
function buildTextSearchString(terms) {
  const unique = [...new Set(terms.map((t) => String(t).trim()).filter(Boolean))];
  // Quote multi-word terms; escape quotes
  return unique
    .map((t) => {
      const escaped = t.replace(/"/g, '\\"');
      return t.includes(' ') ? `"${escaped}"` : escaped;
    })
    .join(' ');
}

/**
 * Levenshtein edit distance (for fuzzy matching).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  const s = normalizeSearchToken(a);
  const t = normalizeSearchToken(b);
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;

  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Check if query fuzzy-matches a keyword within tolerance.
 * @param {string} query
 * @param {string} keyword
 * @returns {boolean}
 */
function isFuzzyMatch(query, keyword) {
  const q = normalizeSearchToken(query);
  const k = normalizeSearchToken(keyword);
  if (!q || !k) return false;
  if (k.includes(q) || q.includes(k)) return true;
  const maxLen = Math.max(q.length, k.length);
  if (maxLen < 3) return false;
  const tolerance = maxLen <= 5 ? 2 : maxLen <= 8 ? 2 : 3;
  return levenshteinDistance(q, k) <= tolerance;
}

/**
 * Generate fuzzy variants for common typo patterns (adjacent transpositions).
 * @param {string} query
 * @returns {string[]}
 */
function generateFuzzyVariants(query) {
  const q = normalizeSearchToken(query);
  if (!q || q.length < 3) return [];
  const variants = new Set();
  // Single character deletion
  for (let i = 0; i < q.length; i++) {
    variants.add(q.slice(0, i) + q.slice(i + 1));
  }
  // Adjacent swap
  for (let i = 0; i < q.length - 1; i++) {
    variants.add(q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2));
  }
  return [...variants].filter((v) => v.length >= 2);
}

module.exports = {
  normalizeSearchToken,
  escapeRegex,
  hasTamilScript,
  hasDevanagariScript,
  isRomanized,
  tokenizeQuery,
  expandSearchQuery,
  buildTextSearchString,
  levenshteinDistance,
  isFuzzyMatch,
  generateFuzzyVariants,
};
