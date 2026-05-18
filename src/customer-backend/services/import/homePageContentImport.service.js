/**
 * Home Page Content tab → customer_home_section_definitions
 *
 * The Content Hub mastersheet's "Home Page Content" tab describes the customer home page
 * layout in row order. This module turns that sheet into HomeSectionDefinition documents
 * (deleting any pre-existing ones — the mastersheet is the source of truth).
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
 * Side effects: deletes ALL existing customer_home_section_definitions, then writes the
 * sheet-derived list. Stale manual CMS edits are intentionally overwritten so the
 * customer app reflects the mastersheet on every upload.
 */

const { HomeSectionDefinition } = require('../../models/HomeSectionDefinition');
const { Category } = require('../../models/Category');
const { Banner } = require('../../models/Banner');
const { Product } = require('../../models/Product');
const { Collection } = require('../../models/Collection');

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
  const base = slugify(label || 'section');
  // HomeSectionDefinition.validateKey: VALID_SECTION_KEYS or KEY_PREFIX_PATTERN
  //   ^(collections|deals|wellbeing|banner_main|banner_sub|banner|section)_[a-zA-Z0-9_-]+$
  return `${prefix}_${base}`.replace(/-+/g, '_');
}

// ─── Sheet parsing ──────────────────────────────────────────────────────────

/**
 * Parse the Home Page Content worksheet into an ordered list of section specs.
 * Returns: [{ kind, label, refs?, categoryNames?, skuList?, imageUrl? }]
 */
function parseHomePageContent(ws) {
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
        sections.push({ kind: 'collections', label: name || 'Collection', skuList });
      }
      continue;
    }

    // Continuation row (empty type column): banner sub-section
    if (!typeRaw && (name || details)) {
      const refs = splitRefs(details).filter((s) => /^Ban[-_]/i.test(s));
      if (refs.length > 0) {
        sections.push({ kind: 'banner_sub', label: name || 'Banner', bannerRefs: refs });
      }
    }
  }

  return sections;
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

async function upsertCollection({ label, productIds, txnSession }) {
  const slug = slugify(label);
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

  const specs = parseHomePageContent(ws);
  if (specs.length === 0) {
    warnings.push({ sheet: 'Home Page Content', message: 'No section rows parsed — leaving home layout untouched' });
    counts.homeSections = { replaced: 0, skipped: 0 };
    return;
  }

  const newDocs = [];
  let order = 0;
  let skipped = 0;

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
        continue;
      }
      newDocs.push({
        key: safeKey('section', spec.label),
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
        continue;
      }
      let collectionId = null;
      try {
        collectionId = await upsertCollection({ label: spec.label, productIds, txnSession: session });
      } catch (e) {
        errors.push({ sheet: 'Home Page Content', message: `Collection "${spec.label}" upsert failed: ${e.message}` });
        skipped += 1;
        continue;
      }
      newDocs.push({
        key: safeKey('collections', spec.label),
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
        // Don't fail the whole import — log a warning so the user knows the reference was unresolved.
        warnings.push({
          sheet: 'Home Page Content',
          message: `${spec.kind === 'banner_main' ? 'Hero' : 'Banner'} "${spec.label}": none of [${(spec.bannerRefs || []).join(', ')}] matched Banner.bannerId — section skipped`,
        });
        skipped += 1;
        continue;
      }
      newDocs.push({
        key: safeKey(spec.kind === 'banner_main' ? 'banner_main' : 'banner_sub', spec.label),
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

  // Replace strategy: the mastersheet is the source of truth for home layout.
  // We clear the entire collection rather than upserting by key — keys are derived from labels
  // and might shift between uploads. A clean replace also removes orphan references to deleted
  // categories/collections that accumulate over time.
  await HomeSectionDefinition.deleteMany({}, { session: session || undefined });
  await HomeSectionDefinition.insertMany(newDocs, { session: session || undefined });

  counts.homeSections = { replaced: newDocs.length, skipped };
}

module.exports = {
  applyHomePageContent,
  // exported for tests
  parseHomePageContent,
};
