/**
 * Shared helpers for home section keys/labels (import + runtime payload).
 */

function slugify(str) {
  return (
    String(str || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home-section'
  );
}

/** Stable merge key for collection rows — matches collection slug and section key base. */
function collectionMergeKey(label) {
  return slugify(label) || 'collection';
}

function keyFromCollectionSlug(slug) {
  return `collections_${String(slug || 'collection').replace(/-/g, '_')}`;
}

/** Strip numeric suffix: collections_foo_2 → collections_foo */
function stripKeyNumericSuffix(key) {
  return String(key || '').replace(/_(\d+)$/, '');
}

/** True when key ends with _2, _3, … (legacy duplicate importer output). */
function isSuffixDuplicateKey(key) {
  return /_\d+$/.test(String(key || ''));
}

function normalizeSectionTitle(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

module.exports = {
  slugify,
  collectionMergeKey,
  keyFromCollectionSlug,
  stripKeyNumericSuffix,
  isSuffixDuplicateKey,
  normalizeSectionTitle,
};
