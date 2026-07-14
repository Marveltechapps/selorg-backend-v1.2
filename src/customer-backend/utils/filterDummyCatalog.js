const DUMMY_NAME_PREFIX = /^(smoke|dummy|mock|fake|test)(\s|_|-|$)/i;
const SMOKE_CAT_PATTERN = /^smoke\s*cat\b/i;
const DUMMY_KEYWORDS = /\b(smoke\s*test|test\s*data|placeholder)\b/i;
const REPEATED_CHARS = /(.)\1{2,}/;
const LONG_CONSONANT_RUN = /[bcdfghjklmnpqrstvwxyz]{8,}/i;

function looksLikeKeyboardMash(name) {
  const label = String(name || '').trim();
  if (label.length < 10 || /\s/.test(label)) return false;
  if (!/^[a-zA-Z]+$/.test(label)) return false;
  return LONG_CONSONANT_RUN.test(label);
}

function isDummyCatalogLabel(name) {
  const label = String(name || '').trim();
  if (!label) return true;
  if (DUMMY_NAME_PREFIX.test(label)) return true;
  if (SMOKE_CAT_PATTERN.test(label)) return true;
  if (DUMMY_KEYWORDS.test(label)) return true;
  if (REPEATED_CHARS.test(label)) return true;
  if (looksLikeKeyboardMash(label)) return true;
  return false;
}

function isDummyCatalogSlug(slug) {
  const value = String(slug || '').trim().toLowerCase();
  if (!value) return true;
  return /^(smoke|dummy|mock|fake|test)(-|_|$)/.test(value) || value.includes('smoke-cat');
}

function filterCatalogLabels(items) {
  return (items || []).filter(
    (item) => !isDummyCatalogLabel(item.name) && !(item.slug && isDummyCatalogSlug(item.slug))
  );
}

module.exports = {
  isDummyCatalogLabel,
  isDummyCatalogSlug,
  filterCatalogLabels,
};
