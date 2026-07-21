/**
 * Home Page Content tab → customer_home_section_definitions
 *
 * The Content Hub mastersheet's "Home Page Content" tab describes the customer home page
 * layout in row order. This module turns that sheet into HomeSectionDefinition documents.
 *
 * Sheet shape (row order = section order on home screen):
 *   Col A: Section Type   (e.g. "Hero Video", "Categories", "Collections", or empty for continuation rows)
 *   Col B: Section Name   (label / banner name / collection title)
 *   Col C: Required Details
 *       - "Hero Video" row: an image/banner URL
 *       - "Categories"     : comma-separated category names
 *       - "Collections"    : comma-separated SKU codes (e.g. "S524,S134,S272")
 *       - continuation row : banner reference codes (e.g. "Ban-052" or "Ban-045,Ban-046,…")
 *
 * Side effects: upserts sheet-derived definitions by unique `key`, then deletes keys that are
 * no longer present. Re-running the same mastersheet is idempotent (no E11000 on key_1).
 * Stale manual CMS edits for removed sections are overwritten so the customer app reflects
 * the mastersheet on every upload.
 */

const { HomeSectionDefinition } = require('../../models/HomeSectionDefinition');
const { HomeSection } = require('../../models/HomeSection');
const { HomeConfig } = require('../../models/HomeConfig');
const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');
const { Product } = require('../../models/Product');
const { Collection } = require('../../models/Collection');
const {
  slugify,
  collectionMergeKey,
  keyFromCollectionSlug,
  stripKeyNumericSuffix,
  isSuffixDuplicateKey,
} = require('../../utils/homeSectionKeys');

const HEADER_ROW_COUNT = 3; // template uses 3 header/spacer rows before data starts

function getCellText(row, col) {
  const cell = row.getCell(col);
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  return String(v).trim();
}

function splitRefs(raw) {
  return String(raw || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

function isVideoUrl(s) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(s || '').trim());
}

async function applyHeroSectionMedia(spec, bannerIds, session) {
  if (!Array.isArray(bannerIds) || bannerIds.length === 0) return;
  const heroMediaUrl = String(spec?.imageUrl || '').trim();
  const isVideo = heroMediaUrl && isVideoUrl(heroMediaUrl);

  if (spec?.kind === 'banner_main' && isVideo) {
    await HomeConfig.updateOne(
      { key: 'main' },
      { $set: { heroVideoUrl: heroMediaUrl } },
      { upsert: true, session: session || undefined }
    );
  }

  for (const oid of bannerIds) {
    const existing = await Banner.findById(oid).session(session || null).lean();
    if (!existing) continue;
    const updates = {};
    if (spec?.kind === 'banner_main') {
      updates.slot = 'hero';
    }
    if (heroMediaUrl && !isVideo && !String(existing.imageUrl || existing.bannerImageUrl || '').trim()) {
      updates.imageUrl = heroMediaUrl;
      updates.bannerImageUrl = heroMediaUrl;
      updates.isActive = true;
    } else if (spec?.kind === 'banner_main' && String(existing.imageUrl || existing.bannerImageUrl || '').trim()) {
      updates.isActive = true;
    }
    if (Object.keys(updates).length === 0) continue;
    await Banner.updateOne({ _id: oid }, { $set: updates }, { session: session || undefined });
  }
}

function slugifyLabel(str) {
  return slugify(str);
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Build a stable token-set fingerprint for fuzzy category matching.
 *
 * Handles the common name variants we see between the mastersheet's
 * `Home Page Content` and `Categories` tabs:
 *   - Case differences  : "FRUITS" vs "Fruits"
 *   - Plural / singular : "Millet Mandi" vs "Millets Mandi", "Grocery" vs "Groceries"
 *   - Filler words      : "Dry Fruits and Seeds Category" vs "DRY FRUITS & Seeds"
 *   - Known typos       : "Diary Products" vs "Dairy Products"
 *
 * Returns a sorted, space-joined token string so two equivalent names map
 * to the same key regardless of word order or casing.
 */
const CATEGORY_TOKEN_ALIAS = new Map([
  // Common mastersheet typos
  ['diary', 'dairy'],
]);
const CATEGORY_STOPWORDS = new Set(['category', 'categories', 'the', 'a', 'an']);

function stemCategoryToken(t) {
  if (!t) return '';
  if (CATEGORY_TOKEN_ALIAS.has(t)) return CATEGORY_TOKEN_ALIAS.get(t);
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

function categoryTokenSet(s) {
  return new Set(
    normalizeName(s)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !CATEGORY_STOPWORDS.has(t))
      .map(stemCategoryToken)
      .filter(Boolean)
  );
}

function categoryFingerprint(s) {
  return [...categoryTokenSet(s)].sort().join(' ');
}

function safeKey(prefix, label) {
  const base = slugifyLabel(label || 'section');
  // HomeSectionDefinition.validateKey: VALID_SECTION_KEYS or KEY_PREFIX_PATTERN
  //   ^(collections|deals|wellbeing|banner_main|banner_sub|banner|section)_[a-zA-Z0-9_-]+$
  return `${prefix}_${base}`.replace(/-+/g, '_');
}

/**
 * Resolve a section key without generating _2 / _3 suffixes.
 * Returns null when the label already maps to a key in this import batch.
 */
function resolveSectionKey(prefix, label, usedKeys) {
  const key = safeKey(prefix, label);
  if (usedKeys.has(key)) return { key: null, collided: true, base: key };
  usedKeys.add(key);
  return { key, collided: false };
}

function isBannerRef(token) {
  return /^Ban[-_]/i.test(String(token || '').trim());
}

function isSkuToken(token) {
  const t = String(token || '').trim();
  if (!t || isBannerRef(t)) return false;
  // Mastersheet SKUs: S524, S134, etc. (also allow generic alphanumeric refs)
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(t);
}

function mergeSkuLists(into, from) {
  const seen = new Set(into);
  for (const sku of from || []) {
    if (!seen.has(sku)) {
      into.push(sku);
      seen.add(sku);
    }
  }
}

/**
 * Merge collection rows that share the same slugified label into one home section.
 * Mastersheets often repeat the label on a second row (extra SKUs or copy/paste);
 * suffixing keys (_2) created duplicate rails and noisy warnings.
 */
function consolidateCollectionSpecs(specs, warnings = null) {
  if (!Array.isArray(specs) || specs.length === 0) return [];
  const labelToEntry = new Map();
  const out = [];

  for (const spec of specs) {
    if (spec.kind !== 'collections') {
      out.push(spec);
      continue;
    }
    const mergeKey = collectionMergeKey(spec.label);
    const existing = labelToEntry.get(mergeKey);
    if (!existing) {
      const merged = {
        ...spec,
        skuList: [...(spec.skuList || [])],
        sourceRows: Array.isArray(spec.sourceRows) ? [...spec.sourceRows] : [],
      };
      labelToEntry.set(mergeKey, { spec: merged, index: out.length });
      out.push(merged);
      continue;
    }
    mergeSkuLists(existing.spec.skuList, spec.skuList);
    const extraRows = Array.isArray(spec.sourceRows) ? spec.sourceRows : [];
    existing.spec.sourceRows = [...(existing.spec.sourceRows || []), ...extraRows];
    if (warnings && extraRows.length > 0) {
      const rows = [...new Set(existing.spec.sourceRows)].sort((a, b) => a - b);
      warnings.push({
        sheet: 'Home Page Content',
        message: `Duplicate collection "${spec.label}" on rows ${rows.join(', ')} — merged into one section`,
      });
    }
  }
  return out;
}

function assertUniqueDocKeys(docs) {
  const seen = new Set();
  const dups = [];
  for (const d of docs) {
    const k = d?.key;
    if (!k) continue;
    if (seen.has(k)) dups.push(k);
    else seen.add(k);
  }
  if (dups.length > 0) {
    throw new Error(
      `Duplicate home section keys in import batch (refusing DB write): ${[...new Set(dups)].join(', ')}`
    );
  }
}

/** Full field set so upserts clear stale type-specific refs (collection ↔ banner ↔ categories). */
function toDefinitionDoc(partial) {
  return {
    key: partial.key,
    label: partial.label || '',
    order: typeof partial.order === 'number' ? partial.order : 0,
    type: partial.type || null,
    collectionId: partial.collectionId || null,
    taglineText: typeof partial.taglineText === 'string' ? partial.taglineText : '',
    categoryIds: Array.isArray(partial.categoryIds) ? partial.categoryIds : [],
    bannerId: partial.bannerId || null,
    bannerIds: Array.isArray(partial.bannerIds) ? partial.bannerIds : [],
    bannerSelectionMode: partial.bannerSelectionMode === 'multiple' ? 'multiple' : 'single',
    useCarousel: partial.useCarousel !== undefined ? Boolean(partial.useCarousel) : true,
  };
}

/**
 * Idempotent replace: upsert by unique `key`, then delete keys not in this batch.
 * Avoids deleteMany→insertMany (empty layout if insert hits E11000 / crashes mid-write).
 */
async function replaceHomeSectionDefinitions(newDocs, txnSession) {
  assertUniqueDocKeys(newDocs);
  const sessionOpt = txnSession || undefined;
  const newKeys = newDocs.map((d) => d.key);

  const ops = newDocs.map((partial) => {
    const doc = toDefinitionDoc(partial);
    return {
      updateOne: {
        filter: { key: doc.key },
        update: { $set: doc },
        upsert: true,
      },
    };
  });
  if (ops.length > 0) {
    await HomeSectionDefinition.bulkWrite(ops, { session: sessionOpt, ordered: true });
  }
  await HomeSectionDefinition.deleteMany({ key: { $nin: newKeys } }, { session: sessionOpt });
}

function pickPreferredDefinition(a, b) {
  const aSuffix = isSuffixDuplicateKey(a.key);
  const bSuffix = isSuffixDuplicateKey(b.key);
  if (aSuffix && !bSuffix) return b;
  if (bSuffix && !aSuffix) return a;
  return (a.order ?? 0) <= (b.order ?? 0) ? a : b;
}

/**
 * Remove stale duplicate artifacts left by older importers (_2 keys, legacy HomeSection rows,
 * suffix collection slugs). Safe: only drops rows that duplicate a canonical label/key from
 * the current import batch or an earlier non-suffix sibling.
 */
async function cleanupDuplicateHomeSectionArtifacts(newDocs, txnSession) {
  const sessionOpt = txnSession || undefined;
  const newKeys = new Set(newDocs.map((d) => d.key));
  const canonicalByLabel = new Map();
  for (const doc of newDocs) {
    if (doc.type === 'collections' && doc.label) {
      canonicalByLabel.set(collectionMergeKey(doc.label), doc.key);
    }
  }

  const allDefs = await HomeSectionDefinition.find({}).sort({ order: 1 }).session(txnSession || null).lean();
  const deleteDefIds = new Set();

  for (const def of allDefs) {
    const baseKey = stripKeyNumericSuffix(def.key);
    if (def.key !== baseKey && newKeys.has(baseKey)) {
      deleteDefIds.add(String(def._id));
      continue;
    }
    if (def.type === 'collections' && def.label) {
      const canonical = canonicalByLabel.get(collectionMergeKey(def.label));
      if (canonical && def.key !== canonical) {
        deleteDefIds.add(String(def._id));
      }
    }
  }

  const survivors = allDefs.filter((d) => !deleteDefIds.has(String(d._id)));
  const labelWinner = new Map();
  for (const def of survivors) {
    if (def.type !== 'collections' || !def.label) continue;
    const mk = collectionMergeKey(def.label);
    const canonical = canonicalByLabel.get(mk);
    if (canonical) {
      if (def.key !== canonical) deleteDefIds.add(String(def._id));
      continue;
    }
    const prev = labelWinner.get(mk);
    if (!prev) {
      labelWinner.set(mk, def);
      continue;
    }
    const keep = pickPreferredDefinition(prev, def);
    const drop = String(keep._id) === String(prev._id) ? def : prev;
    deleteDefIds.add(String(drop._id));
    labelWinner.set(mk, keep);
  }

  const defObjectIds = [...deleteDefIds];
  if (defObjectIds.length > 0) {
    await HomeSectionDefinition.deleteMany({ _id: { $in: defObjectIds } }, { session: sessionOpt });
  }

  const legacySections = await HomeSection.find({ isActive: true }).session(txnSession || null).lean();
  const legacyDeleteIds = [];
  for (const sec of legacySections) {
    const baseKey = stripKeyNumericSuffix(sec.sectionKey);
    if (sec.sectionKey !== baseKey && newKeys.has(baseKey)) {
      legacyDeleteIds.push(sec._id);
      continue;
    }
    if (sec.title && canonicalByLabel.has(collectionMergeKey(sec.title))) {
      legacyDeleteIds.push(sec._id);
    }
  }
  if (legacyDeleteIds.length > 0) {
    await HomeSection.deleteMany({ _id: { $in: legacyDeleteIds } }, { session: sessionOpt });
  }

  let collectionsDeactivated = 0;
  for (const slug of canonicalByLabel.keys()) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await Collection.updateMany(
      { slug: { $regex: new RegExp(`^${escaped}-\\d+$`) }, isActive: true },
      { $set: { isActive: false } },
      { session: sessionOpt }
    );
    collectionsDeactivated += result.modifiedCount || 0;
  }

  return {
    definitionsRemoved: defObjectIds.length,
    legacySectionsRemoved: legacyDeleteIds.length,
    collectionsDeactivated,
  };
}

// ─── Sheet parsing ──────────────────────────────────────────────────────────

/**
 * Parse the Home Page Content worksheet into an ordered list of section specs.
 * Returns: [{ kind, label, refs?, categoryNames?, skuList?, imageUrl? }]
 */
function parseHomePageContent(ws, warnings = null) {
  if (!ws) return [];
  const sections = [];
  let pendingHero = false; // "Hero Video" appears as a label row; data is on the following row

  for (let r = HEADER_ROW_COUNT + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const typeRaw = getCellText(row, 1);
    const name = getCellText(row, 2);
    const details = getCellText(row, 3);

    if (!typeRaw && !name && !details) continue;

    const type = typeRaw.toLowerCase();

    if (type.includes('hero video') || type === 'hero' || type === 'hero banner') {
      pendingHero = true;
      continue; // next row carries the hero data
    }

    if (pendingHero) {
      pendingHero = false;
      const refs = splitRefs(details).filter((s) => /^Ban[-_]/i.test(s));
      const heroImage = isHttpUrl(name) ? name : isHttpUrl(details) ? details : '';
      if (refs.length === 0 && !heroImage) continue;
      sections.push({
        kind: 'banner_main',
        label: 'Hero',
        bannerRefs: refs,
        imageUrl: heroImage,
      });
      continue;
    }

    if (type === 'categories') {
      const categoryNames = splitRefs(details);
      if (categoryNames.length > 0) {
        sections.push({ kind: 'super_category', label: name || 'Categories', categoryNames });
      }
      continue;
    }

    if (type === 'collections' || type === 'collection') {
      const skuList = splitRefs(details);
      if (skuList.length > 0) {
        sections.push({
          kind: 'collections',
          label: name || 'Collection',
          skuList,
          sourceRows: [r],
        });
      }
      continue;
    }

    // Continuation row (empty type column): extra SKUs for previous collection, or banner sub-section
    if (!typeRaw && (name || details)) {
      const refs = splitRefs(details).filter((s) => isBannerRef(s));
      if (refs.length > 0) {
        sections.push({ kind: 'banner_sub', label: name || 'Banner', bannerRefs: refs });
        continue;
      }
      const skuList = splitRefs(details).filter((s) => isSkuToken(s));
      if (skuList.length > 0) {
        const last = sections[sections.length - 1];
        const continuationLabel = name || last?.label || 'Collection';
        if (
          last?.kind === 'collections' &&
          collectionMergeKey(continuationLabel) === collectionMergeKey(last.label)
        ) {
          mergeSkuLists(last.skuList, skuList);
          if (Array.isArray(last.sourceRows)) last.sourceRows.push(r);
          else last.sourceRows = [r];
          continue;
        }
        sections.push({
          kind: 'collections',
          label: continuationLabel,
          skuList,
          sourceRows: [r],
        });
      }
    }
  }

  return consolidateCollectionSpecs(sections, warnings);
}

// ─── Reference resolution ───────────────────────────────────────────────────

async function resolveBannerIds(refs, txnSession) {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const rows = await (Banner.find({ bannerId: { $in: refs } }).select('_id bannerId').session(txnSession || null).lean());
  const byCode = new Map(rows.map((b) => [String(b.bannerId), String(b._id)]));
  return refs.map((code) => byCode.get(code)).filter(Boolean);
}

async function resolveCategoryIds(names, txnSession) {
  if (!Array.isArray(names) || names.length === 0) return [];
  // Match against TOP-LEVEL (parentId: null) active categories only,
  // so e.g. "Rice Mandi" in the sheet picks the level-1 category.
  const all = await (Category.find({ parentId: null, isActive: true }).select('_id name').session(txnSession || null).lean());

  // Build three lookup layers, in priority order:
  //   1. Exact normalized name           (preserves explicit picks, fastest)
  //   2. Token-set fingerprint           (handles plural/singular + word order)
  //   3. Token-subset (sheet ⊆ db)       (handles short labels like "Rice" → "Rice Mandi")
  const byNorm = new Map();
  const byFingerprint = new Map();
  const dbCats = [];
  for (const c of all) {
    const norm = normalizeName(c.name);
    if (!byNorm.has(norm)) byNorm.set(norm, String(c._id));
    const fp = categoryFingerprint(c.name);
    if (fp && !byFingerprint.has(fp)) byFingerprint.set(fp, String(c._id));
    dbCats.push({ id: String(c._id), tokens: categoryTokenSet(c.name) });
  }

  const out = [];
  const seen = new Set();
  for (const name of names) {
    const exact = byNorm.get(normalizeName(name));
    if (exact) {
      if (!seen.has(exact)) { seen.add(exact); out.push(exact); }
      continue;
    }
    const fp = categoryFingerprint(name);
    const byFp = fp ? byFingerprint.get(fp) : null;
    if (byFp) {
      if (!seen.has(byFp)) { seen.add(byFp); out.push(byFp); }
      continue;
    }
    // Token-subset match: every token from the sheet name must appear in the DB name.
    const sheetTokens = categoryTokenSet(name);
    if (sheetTokens.size === 0) continue;
    const candidate = dbCats.find((c) => [...sheetTokens].every((t) => c.tokens.has(t)));
    if (candidate && !seen.has(candidate.id)) {
      seen.add(candidate.id);
      out.push(candidate.id);
    }
  }
  return out;
}

async function resolveProductIdsBySku(skuList, txnSession) {
  if (!Array.isArray(skuList) || skuList.length === 0) return [];
  const rows = await (Product.find({ sku: { $in: skuList }, isActive: true })
    .select('_id sku')
    .session(txnSession || null)
    .lean());
  const bySku = new Map(rows.map((p) => [String(p.sku), String(p._id)]));
  return skuList.map((s) => bySku.get(s)).filter(Boolean);
}

async function upsertCollection({ label, productIds, txnSession, slug: slugOverride }) {
  const slug = slugOverride || slugify(label);
  const updateData = {
    name: label,
    slug,
    type: 'manual',
    productIds,
    isActive: true,
  };
  const existing = await (Collection.findOne({ slug }).session(txnSession || null).lean());
  if (existing) {
    await Collection.updateOne({ _id: existing._id }, { $set: updateData }, { session: txnSession || undefined });
    return String(existing._id);
  }
  const created = await Collection.create([updateData], { session: txnSession || undefined });
  return String(Array.isArray(created) ? created[0]._id : created._id);
}

/** @deprecated Duplicates are merged; retained for backward-compatible tests. */
function uniqueCollectionSlug(label, usedSlugs) {
  const base = slugify(label) || 'collection';
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }
  return base;
}

/** @deprecated Use resolveSectionKey — suffix keys are no longer generated. */
function uniqueSafeKey(prefix, label, usedKeys) {
  return resolveSectionKey(prefix, label, usedKeys);
}

// ─── Main entry ─────────────────────────────────────────────────────────────

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ session?: import('mongoose').ClientSession|null, counts: object, warnings: any[], errors: any[] }} ctx
 */
async function applyHomePageContent(wb, { session = null, counts, warnings, errors }) {
  const ws = wb.getWorksheet('Home Page Content') || wb.getWorksheet('Home Content');
  if (!ws) {
    warnings.push({ sheet: 'Home Page Content', message: 'Sheet not found — leaving home layout untouched' });
    counts.homeSections = { replaced: 0, skipped: 0 };
    return;
  }

  const specs = parseHomePageContent(ws, warnings);
  if (specs.length === 0) {
    warnings.push({ sheet: 'Home Page Content', message: 'No section rows parsed — leaving home layout untouched' });
    counts.homeSections = { replaced: 0, skipped: 0 };
    return;
  }

  const newDocs = [];
  const usedKeys = new Set();
  const usedCollectionSlugs = new Set();
  /** slugify(label) → { docIndex, collectionId, productIds, label } */
  const collectionDocsByMergeKey = new Map();
  let order = 0;
  let skipped = 0;

  const assignKey = (prefix, label) => {
    const { key, collided } = resolveSectionKey(prefix, label, usedKeys);
    if (collided) {
      warnings.push({
        sheet: 'Home Page Content',
        message: `Duplicate section label "${label}" — skipping duplicate row (same key already defined)`,
      });
    }
    return key;
  };

  for (const spec of specs) {
    order += 1;

    if (spec.kind === 'super_category') {
      const ids = await resolveCategoryIds(spec.categoryNames, session);
      if (ids.length === 0) {
        warnings.push({
          sheet: 'Home Page Content',
          message: `Categories section "${spec.label}": none of [${spec.categoryNames.join(', ')}] matched top-level categories — section skipped`,
        });
        skipped += 1;
        order -= 1;
        continue;
      }
      const key = assignKey('section', spec.label);
      if (!key) {
        skipped += 1;
        order -= 1;
        continue;
      }
      newDocs.push({
        key,
        label: spec.label,
        order,
        type: 'super_category',
        categoryIds: ids,
      });
      continue;
    }

    if (spec.kind === 'collections') {
      const productIds = await resolveProductIdsBySku(spec.skuList, session);
      if (productIds.length === 0) {
        warnings.push({
          sheet: 'Home Page Content',
          message: `Collection "${spec.label}": none of [${spec.skuList.join(', ')}] matched products — section skipped`,
        });
        skipped += 1;
        order -= 1;
        continue;
      }
      const mergeKey = collectionMergeKey(spec.label);
      const prior = collectionDocsByMergeKey.get(mergeKey);
      if (prior) {
        const mergedProductIds = [...new Set([...prior.productIds, ...productIds])];
        try {
          await Collection.updateOne(
            { _id: prior.collectionId },
            { $set: { productIds: mergedProductIds, name: prior.label, isActive: true } },
            { session: session || undefined }
          );
        } catch (e) {
          errors.push({
            sheet: 'Home Page Content',
            message: `Collection "${spec.label}" merge update failed: ${e.message}`,
          });
        }
        prior.productIds = mergedProductIds;
        const rows = Array.isArray(spec.sourceRows) && spec.sourceRows.length > 0
          ? spec.sourceRows.join(', ')
          : 'unknown';
        warnings.push({
          sheet: 'Home Page Content',
          message: `Duplicate collection "${spec.label}" (row${spec.sourceRows?.length === 1 ? '' : 's'} ${rows}) — merged into existing section "${prior.key}"`,
        });
        order -= 1;
        continue;
      }

      let collectionId = null;
      let collectionSlug = null;
      try {
        // One canonical slug per label; duplicates are merged above, not suffix-renamed.
        collectionSlug = slugify(spec.label) || 'collection';
        if (usedCollectionSlugs.has(collectionSlug)) {
          warnings.push({
            sheet: 'Home Page Content',
            message: `Collection "${spec.label}" slug "${collectionSlug}" already used by a different section — row skipped`,
          });
          skipped += 1;
          order -= 1;
          continue;
        }
        usedCollectionSlugs.add(collectionSlug);
        collectionId = await upsertCollection({
          label: spec.label,
          productIds,
          txnSession: session,
          slug: collectionSlug,
        });
      } catch (e) {
        errors.push({ sheet: 'Home Page Content', message: `Collection "${spec.label}" upsert failed: ${e.message}` });
        skipped += 1;
        continue;
      }
      const collectionKey = keyFromCollectionSlug(collectionSlug);
      if (usedKeys.has(collectionKey)) {
        warnings.push({
          sheet: 'Home Page Content',
          message: `Collection "${spec.label}" produced duplicate key "${collectionKey}" — section skipped`,
        });
        skipped += 1;
        continue;
      }
      usedKeys.add(collectionKey);
      collectionDocsByMergeKey.set(mergeKey, {
        key: collectionKey,
        collectionId,
        productIds: [...productIds],
        label: spec.label,
      });
      newDocs.push({
        key: collectionKey,
        label: spec.label,
        order,
        type: 'collections',
        collectionId,
      });
      continue;
    }

    if (spec.kind === 'banner_main' || spec.kind === 'banner_sub') {
      const bannerIds = await resolveBannerIds(spec.bannerRefs || [], session);
      if (bannerIds.length === 0) {
        warnings.push({
          sheet: 'Home Page Content',
          message: `${spec.kind === 'banner_main' ? 'Hero' : 'Banner'} "${spec.label}": none of [${(spec.bannerRefs || []).join(', ')}] matched Banner.bannerId — section skipped`,
        });
        skipped += 1;
        order -= 1;
        continue;
      }
      await applyHeroSectionMedia(spec, bannerIds, session);
      const key = assignKey(spec.kind === 'banner_main' ? 'banner_main' : 'banner_sub', spec.label);
      if (!key) {
        skipped += 1;
        order -= 1;
        continue;
      }
      newDocs.push({
        key,
        label: spec.label,
        order,
        type: spec.kind,
        bannerIds,
        bannerSelectionMode: bannerIds.length > 1 ? 'multiple' : 'single',
        useCarousel: bannerIds.length > 1,
      });
      continue;
    }
  }

  if (newDocs.length === 0) {
    warnings.push({ sheet: 'Home Page Content', message: 'No resolvable sections — leaving existing home layout in place' });
    counts.homeSections = { replaced: 0, skipped };
    return;
  }

  // Idempotent replace: upsert by unique key, then drop keys absent from this sheet.
  // Mastersheet remains source of truth; orphans (removed sections) are deleted after upserts
  // succeed so a mid-write failure cannot wipe the whole home layout.
  try {
    await replaceHomeSectionDefinitions(newDocs, session);
    const cleanup = await cleanupDuplicateHomeSectionArtifacts(newDocs, session);
    counts.homeSectionsCleanup = cleanup;
  } catch (e) {
    errors.push({
      sheet: 'Home Page Content',
      message: `Home layout regeneration failed: ${e.message}`,
    });
    throw e;
  }

  counts.homeSections = { replaced: newDocs.length, skipped };
}

module.exports = {
  applyHomePageContent,
  // exported for tests
  parseHomePageContent,
  safeKey,
  resolveSectionKey,
  uniqueSafeKey,
  uniqueCollectionSlug,
  keyFromCollectionSlug,
  collectionMergeKey,
  consolidateCollectionSpecs,
  mergeSkuLists,
  cleanupDuplicateHomeSectionArtifacts,
  isSkuToken,
  isBannerRef,
  assertUniqueDocKeys,
  toDefinitionDoc,
};
