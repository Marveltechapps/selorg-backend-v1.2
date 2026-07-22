/**
 * Deduplicate home section definitions for runtime payloads.
 * Drops legacy _2/_3 suffix keys and duplicate collection labels.
 */
const {
  collectionMergeKey,
  stripKeyNumericSuffix,
  isSuffixDuplicateKey,
} = require('./homeSectionKeys');

function pickPreferredDefinition(a, b) {
  const aSuffix = isSuffixDuplicateKey(a.key);
  const bSuffix = isSuffixDuplicateKey(b.key);
  if (aSuffix && !bSuffix) return b;
  if (bSuffix && !aSuffix) return a;
  return (a.order ?? 0) <= (b.order ?? 0) ? a : b;
}

function dedupeHomeSectionDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) return [];
  const sorted = [...definitions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const keySet = new Set(sorted.map((d) => d.key));
  const labelWinner = new Map();
  const out = [];

  for (const def of sorted) {
    const baseKey = stripKeyNumericSuffix(def.key);
    if (def.key !== baseKey && keySet.has(baseKey)) continue;

    if (def.type === 'collections' && def.label) {
      const mk = collectionMergeKey(def.label);
      const prev = labelWinner.get(mk);
      if (prev) {
        const keep = pickPreferredDefinition(prev, def);
        if (String(keep._id || keep.key) !== String(def._id || def.key)) continue;
        const dropIdx = out.findIndex((d) => collectionMergeKey(d.label) === mk);
        if (dropIdx >= 0) out.splice(dropIdx, 1);
      }
      labelWinner.set(mk, def);
    }

    out.push(def);
  }

  return out.map((d, idx) => ({ ...d, order: idx + 1 }));
}

module.exports = { dedupeHomeSectionDefinitions };
