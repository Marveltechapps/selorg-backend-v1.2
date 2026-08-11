/**
 * Helpers for Master Sheet category taxonomy: duplicate L1/L2 consolidation and
 * seed-SKU deactivation. Re-imports historically created suffix slugs
 * (boiled-rice-3 … boiled-rice-9) under the same parent; customer APIs must
 * treat same-named L2s as one subcategory. L1 twins like "Millet Mandi" /
 * "Millets Mandi" are collapsed by token fingerprint.
 */
const { Category } = require('../models/Category');
const { Product } = require('../models/Product');
const mongoose = require('mongoose');

/**
 * Strip master-sheet section-header punctuation (e.g. "Seeds:" → "Seeds").
 * @param {string} name
 */
function sanitizeCategoryDisplayName(name) {
  return String(name || '')
    .trim()
    .replace(/[:;.,]+\s*$/, '')
    .trim();
}

function normalizeCategoryName(name) {
  return sanitizeCategoryDisplayName(name).toLowerCase().replace(/\s+/g, ' ');
}

const CATEGORY_TOKEN_ALIAS = new Map([['diary', 'dairy']]);
const CATEGORY_STOPWORDS = new Set(['category', 'categories', 'the', 'a', 'an']);

function stemCategoryToken(t) {
  if (!t) return '';
  if (CATEGORY_TOKEN_ALIAS.has(t)) return CATEGORY_TOKEN_ALIAS.get(t);
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

/**
 * Stable fingerprint for plural/singular L1 twins
 * ("Millet Mandi" ↔ "Millets Mandi").
 */
function categoryFingerprint(name) {
  return [
    ...new Set(
      normalizeCategoryName(name)
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t && !CATEGORY_STOPWORDS.has(t))
        .map(stemCategoryToken)
        .filter(Boolean)
    ),
  ]
    .sort()
    .join(' ');
}

/**
 * Dedupe key for L2s: normalize "&" ↔ "and" and strip a trailing " rice"
 * so sheet variants like "Greens & Herbs" / "Greens And Herbs" and
 * "Basmathi & Seeraga Samba" / "Basmathi & Seeraga Samba RICE" collapse.
 */
function normalizeSubcategoryDedupeKey(name) {
  return normalizeCategoryName(name)
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .replace(/\s+rice$/, '')
    .trim();
}

/** Prefer unsuffixed slug (boiled-rice) over boiled-rice-9. */
function slugSuffixRank(slug) {
  const m = String(slug || '').match(/-(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/** Prefer "Seeds" over master-sheet header "Seeds:". Lower is better. */
function displayNameCleanlinessRank(name) {
  const n = String(name || '').trim();
  return /[:;.,]+$/.test(n) ? 1 : 0;
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
    const dn = displayNameCleanlinessRank(a.name) - displayNameCleanlinessRank(b.name);
    if (dn !== 0) return dn;
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
      name: sanitizeCategoryDisplayName(winner.name),
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

/**
 * In-memory dedupe of L1 rows by fingerprint (API response hygiene).
 * @param {Array<object>} categories
 * @returns {Array<object>}
 */
function dedupeTopCategoriesByFingerprint(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const c of categories) {
    const fp = categoryFingerprint(c.name) || normalizeCategoryName(c.name);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    out.push(c);
  }
  return out;
}

/**
 * Collapse active L1 twins that share a token fingerprint (Millet/Millets Mandi):
 * remap products + child L2s onto the canonical category and deactivate losers.
 * Also rewrites HomeSectionDefinition.categoryIds that pointed at losers.
 * @param {{ session?: import('mongoose').ClientSession, warnings?: array }} [opts]
 */
async function consolidateDuplicateTopCategories({ session = null, warnings = [] } = {}) {
  const tops = await bindSession(
    Category.find({ parentId: { $in: [null, undefined] }, isActive: true, level: 1 }).select(
      '_id name slug order hierarchyCodes'
    ),
    session
  ).lean();

  const byFp = new Map();
  for (const c of tops) {
    const fp = categoryFingerprint(c.name);
    if (!fp) continue;
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(c);
  }

  let groups = 0;
  let deactivated = 0;
  let remapped = 0;
  let homeUpdated = 0;

  for (const [, group] of byFp) {
    if (group.length < 2) continue;
    groups += 1;

    const counts = await Promise.all(
      group.map(async (c) => {
        const n = await bindSession(
          Product.countDocuments({
            categoryId: c._id,
            classification: 'Style',
            isActive: true,
          }),
          session
        );
        return { ...c, productCount: n };
      })
    );

    const winner = pickCanonicalSubcategory(counts);
    if (!winner) continue;
    const losers = counts.filter((c) => String(c._id) !== String(winner._id));
    const loserIds = losers.map((c) => c._id);

    const codeSet = new Set(
      [...(winner.hierarchyCodes || []), ...losers.flatMap((l) => l.hierarchyCodes || [])]
        .map((c) => String(c || '').trim())
        .filter(Boolean)
    );
    if (codeSet.size > 0) {
      await bindSession(
        Category.updateOne({ _id: winner._id }, { $set: { hierarchyCodes: [...codeSet] } }),
        session
      );
    }

    // Reparent active L2s from losers onto the winner (merge same-named L2s later).
    for (const loser of losers) {
      const childSubs = await bindSession(
        Category.find({ parentId: loser._id, isActive: true }).select('_id name slug hierarchyCodes'),
        session
      ).lean();
      for (const sub of childSubs) {
        const twin = await bindSession(
          Category.findOne({
            parentId: winner._id,
            isActive: true,
            name: new RegExp(`^${String(sub.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          }).select('_id hierarchyCodes'),
          session
        ).lean();
        if (twin) {
          const r = await bindSession(
            Product.updateMany(
              { subcategoryId: sub._id },
              { $set: { subcategoryId: twin._id, categoryId: winner._id } }
            ),
            session
          );
          remapped += r.modifiedCount || r.nModified || 0;
          await bindSession(
            Category.updateOne({ _id: sub._id }, { $set: { isActive: false } }),
            session
          );
          deactivated += 1;
          const mergedCodes = [
            ...new Set(
              [...(twin.hierarchyCodes || []), ...(sub.hierarchyCodes || [])]
                .map((x) => String(x || '').trim())
                .filter(Boolean)
            ),
          ];
          await bindSession(
            Category.updateOne({ _id: twin._id }, { $set: { hierarchyCodes: mergedCodes } }),
            session
          );
        } else {
          await bindSession(
            Category.updateOne({ _id: sub._id }, { $set: { parentId: winner._id } }),
            session
          );
        }
      }
    }

    if (loserIds.length > 0) {
      const remap = await bindSession(
        Product.updateMany({ categoryId: { $in: loserIds } }, { $set: { categoryId: winner._id } }),
        session
      );
      remapped += remap.modifiedCount || remap.nModified || 0;

      const deact = await bindSession(
        Category.updateMany({ _id: { $in: loserIds } }, { $set: { isActive: false } }),
        session
      );
      deactivated += deact.modifiedCount || deact.nModified || 0;

      // Rewrite home section categoryIds so CMS grids keep order under the winner.
      try {
        const homeColl = mongoose.connection.db.collection('customer_home_section_definitions');
        const defs = await homeColl
          .find({ categoryIds: { $in: loserIds } }, { projection: { _id: 1, categoryIds: 1 } })
          .toArray();
        for (const def of defs) {
          const next = [];
          const seen = new Set();
          for (const id of def.categoryIds || []) {
            const raw = String(id);
            const replaced = loserIds.some((l) => String(l) === raw) ? String(winner._id) : raw;
            if (seen.has(replaced)) continue;
            seen.add(replaced);
            next.push(
              mongoose.Types.ObjectId.isValid(replaced)
                ? new mongoose.Types.ObjectId(replaced)
                : id
            );
          }
          await homeColl.updateOne({ _id: def._id }, { $set: { categoryIds: next } });
          homeUpdated += 1;
        }
      } catch (_) {
        /* home section collection may be unavailable in some contexts */
      }
    }

    warnings.push({
      sheet: 'Categories',
      message: `Consolidated ${group.length} duplicate top categories "${losers.map((l) => l.name).join(' / ')}" → kept "${winner.name}" (${winner.slug})`,
    });
  }

  return { groups, deactivated, remapped, homeUpdated };
}

function bindSession(query, session) {
  if (session && query && typeof query.session === 'function') return query.session(session);
  return query;
}

module.exports = {
  sanitizeCategoryDisplayName,
  normalizeCategoryName,
  categoryFingerprint,
  normalizeSubcategoryDedupeKey,
  pickCanonicalSubcategory,
  dedupeSubcategoriesByName,
  dedupeTopCategoriesByFingerprint,
  findSameNamedSubcategoryTwins,
  deactivateLegacySeedProducts,
  consolidateDuplicateSubcategories,
  consolidateDuplicateTopCategories,
};
