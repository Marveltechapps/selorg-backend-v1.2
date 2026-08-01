/**
 * Helpers for Master Sheet category taxonomy: duplicate L2 consolidation and
 * seed-SKU deactivation. Re-imports historically created suffix slugs
 * (boiled-rice-3 … boiled-rice-9) under the same parent; customer APIs must
 * treat same-named L2s as one subcategory.
 */
const { Category } = require('../models/Category');
const { Product } = require('../models/Product');

function normalizeCategoryName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Dedupe key for L2s: strip a trailing " rice" so sheet variants like
 * "Basmathi & Seeraga Samba" / "Basmathi & Seeraga Samba RICE" collapse.
 */
function normalizeSubcategoryDedupeKey(name) {
  return normalizeCategoryName(name)
    .replace(/\s+rice$/, '')
    .trim();
}

/** Prefer unsuffixed slug (boiled-rice) over boiled-rice-9. */
function slugSuffixRank(slug) {
  const m = String(slug || '').match(/-(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Among same-named L2 docs, pick the canonical one.
 * Prefer higher productCount, then unsuffixed slug, then stable _id.
 * @param {Array<{ _id: any, slug?: string, productCount?: number, order?: number }>} group
 */
function pickCanonicalSubcategory(group) {
  if (!Array.isArray(group) || group.length === 0) return null;
  return [...group].sort((a, b) => {
    const pc = (b.productCount || 0) - (a.productCount || 0);
    if (pc !== 0) return pc;
    const sr = slugSuffixRank(a.slug) - slugSuffixRank(b.slug);
    if (sr !== 0) return sr;
    const oa = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
    const ob = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
    if (oa !== ob) return oa - ob;
    return String(a._id).localeCompare(String(b._id));
  })[0];
}

/**
 * Collapse duplicate L2s that share the same display name (case-insensitive).
 * Merges productCount onto the canonical row so the sidebar shows one entry.
 * @param {Array<object>} subcategories - lean docs or API rows with name/slug/productCount
 * @returns {Array<object>}
 */
function dedupeSubcategoriesByName(subcategories) {
  if (!Array.isArray(subcategories) || subcategories.length === 0) return [];
  const groups = new Map();
  const orderKeys = [];
  for (const s of subcategories) {
    const key = normalizeSubcategoryDedupeKey(s.name);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
      orderKeys.push(key);
    }
    groups.get(key).push(s);
  }
  const out = [];
  for (const key of orderKeys) {
    const group = groups.get(key);
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const totalCount = group.reduce((n, s) => n + (Number(s.productCount) || 0), 0);
    const winner = pickCanonicalSubcategory(group);
    out.push({
      ...winner,
      productCount: totalCount,
    });
  }
  return out;
}

/**
 * Same-named L2 twins under a parent (and optional alias parents), including
 * the selected subcategory itself.
 * @param {object} selectedSub
 * @param {Array<object>} candidateSubs
 */
function findSameNamedSubcategoryTwins(selectedSub, candidateSubs) {
  if (!selectedSub) return [];
  const nameKey = normalizeSubcategoryDedupeKey(selectedSub.name);
  const slugKey = String(selectedSub.slug || '')
    .trim()
    .toLowerCase();
  const seen = new Set();
  const twins = [];
  for (const s of candidateSubs || []) {
    if (!s?._id) continue;
    const id = String(s._id);
    if (seen.has(id)) continue;
    const sameName = nameKey && normalizeSubcategoryDedupeKey(s.name) === nameKey;
    const sameSlug =
      slugKey &&
      String(s.slug || '')
        .trim()
        .toLowerCase() === slugKey;
    if (!sameName && !sameSlug) continue;
    seen.add(id);
    twins.push(s);
  }
  if (!seen.has(String(selectedSub._id))) {
    twins.unshift(selectedSub);
  }
  return twins;
}

/**
 * Deactivate legacy seed/demo SKUs (PROD-*) so they never appear in the shop.
 * @param {{ session?: import('mongoose').ClientSession }} [opts]
 * @returns {Promise<number>} modified count
 */
async function deactivateLegacySeedProducts({ session = null } = {}) {
  const q = Product.updateMany(
    { sku: /^PROD-\d+$/i },
    { $set: { isActive: false, isSaleable: false, status: 'inactive' } }
  );
  if (session) q.session(session);
  const res = await q;
  return res.modifiedCount || res.nModified || 0;
}

/**
 * For each L1 parent, consolidate duplicate active L2s that share a name:
 * remap products onto the canonical subcategory and deactivate the losers.
 * @param {{ session?: import('mongoose').ClientSession, warnings?: array }} [opts]
 * @returns {Promise<{ groups: number, deactivated: number, remapped: number }>}
 */
async function consolidateDuplicateSubcategories({ session = null, warnings = [] } = {}) {
  const parents = await bindSession(
    Category.find({ parentId: { $in: [null, undefined] }, isActive: true }).select('_id'),
    session
  ).lean();

  let groups = 0;
  let deactivated = 0;
  let remapped = 0;

  for (const parent of parents) {
    const subs = await bindSession(
      Category.find({ parentId: parent._id, isActive: true, level: 2 }).select(
        '_id name slug order hierarchyCodes'
      ),
      session
    ).lean();

    const byName = new Map();
    for (const s of subs) {
      const key = normalizeSubcategoryDedupeKey(s.name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(s);
    }

    for (const [, group] of byName) {
      if (group.length < 2) continue;
      groups += 1;

      const counts = await Promise.all(
        group.map(async (s) => {
          const n = await bindSession(
            Product.countDocuments({
              subcategoryId: s._id,
              classification: 'Style',
              isActive: true,
            }),
            session
          );
          return { ...s, productCount: n };
        })
      );

      const winner = pickCanonicalSubcategory(counts);
      if (!winner) continue;
      const losers = counts.filter((s) => String(s._id) !== String(winner._id));
      const loserIds = losers.map((s) => s._id);

      // Merge hierarchy codes onto the winner so taxonomy queries stay complete.
      const codeSet = new Set(
        [...(winner.hierarchyCodes || []), ...losers.flatMap((l) => l.hierarchyCodes || [])]
          .map((c) => String(c || '').trim())
          .filter(Boolean)
      );
      if (codeSet.size > 0) {
        await bindSession(
          Category.updateOne(
            { _id: winner._id },
            { $set: { hierarchyCodes: [...codeSet] } }
          ),
          session
        );
      }

      if (loserIds.length > 0) {
        const remap = await bindSession(
          Product.updateMany(
            { subcategoryId: { $in: loserIds } },
            {
              $set: {
                subcategoryId: winner._id,
                categoryId: parent._id,
              },
            }
          ),
          session
        );
        remapped += remap.modifiedCount || remap.nModified || 0;

        const deact = await bindSession(
          Category.updateMany(
            { _id: { $in: loserIds } },
            { $set: { isActive: false } }
          ),
          session
        );
        deactivated += deact.modifiedCount || deact.nModified || 0;
      }

      warnings.push({
        sheet: 'Categories',
        message: `Consolidated ${group.length} duplicate "${winner.name}" subcategories under parent ${parent._id} → kept ${winner.slug}`,
      });
    }
  }

  return { groups, deactivated, remapped };
}

function bindSession(query, session) {
  if (session && query && typeof query.session === 'function') return query.session(session);
  return query;
}

module.exports = {
  normalizeCategoryName,
  normalizeSubcategoryDedupeKey,
  pickCanonicalSubcategory,
  dedupeSubcategoriesByName,
  findSameNamedSubcategoryTwins,
  deactivateLegacySeedProducts,
  consolidateDuplicateSubcategories,
};
