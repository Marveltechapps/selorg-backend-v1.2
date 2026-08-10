/**
 * Import SubCategory banner media from Master Sheet sheet "Subcategories".
 *
 * Business rule: Categories (L1) have NO banner/video/YouTube.
 * Only SubCategories (L2) receive media from this sheet.
 *
 * Sheet columns (current workbook):
 *   Banner ID | Sub-Category Banner URL | Sub-Category Banner Name | video | youtube video link
 *
 * Matching: case-insensitive / trimmed name against Categories L2 names.
 * Soft alias cleanup (promotional suffixes) only when exact match fails.
 * Unmatched rows → warning, import continues.
 *
 * Writes onto CustomerCategory (level 2) + customer_category_media (subcategory rows only).
 */
const { Category } = require('../../models/Category');
const { CategoryMedia } = require('../../models/CategoryMedia');

function normalizeHeaderKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
}

function normalizeName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Exact-match key: lower, trim, collapse spaces, unify &/and. */
function exactMatchKey(raw) {
  return normalizeName(raw)
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Soft key for fallback: strip promotional noise. */
function softMatchKey(raw) {
  return exactMatchKey(raw)
    .replace(/\(promotional\)/gi, '')
    .replace(/\(promo[^)]*\)/gi, '')
    .replace(/\bpromotional\b/gi, '')
    .replace(/\bpromo\b/gi, '')
    .replace(/\bspl\b/gi, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Core tokens for fuzzy match: drop generic category words + light stemming. */
function matchTokens(raw) {
  const STOP = new Set([
    'and',
    'the',
    'of',
    'with',
    'for',
    'vegetable',
    'vegetables',
    'fruit',
    'fruits',
    'mix',
  ]);
  return softMatchKey(raw)
    .split(' ')
    .map((w) => {
      let t = w;
      if (t.endsWith('ies') && t.length > 4) t = `${t.slice(0, -3)}y`;
      else if (t.endsWith('oes') && t.length > 4) t = t.slice(0, -2); // mangoes -> mango
      else if (t.endsWith('ses') && t.length > 4) t = t.slice(0, -2);
      else if (
        t.endsWith('s') &&
        !t.endsWith('ss') &&
        !t.endsWith('ous') &&
        !t.endsWith('ius') &&
        t.length > 3
      ) {
        t = t.slice(0, -1);
      }
      return t;
    })
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function tokensCompatible(a, b) {
  if (!a.length || !b.length) return false;
  const tokenClose = (at, bt) => {
    if (at === bt) return true;
    if (at.startsWith(bt) || bt.startsWith(at)) return Math.min(at.length, bt.length) >= 4;
    // shared stem prefix (nutrition ↔ nutritious)
    const n = Math.min(at.length, bt.length);
    let i = 0;
    while (i < n && at[i] === bt[i]) i += 1;
    return i >= 6;
  };
  if (a.length === 1 && b.length === 1) return tokenClose(a[0], b[0]);
  return a.every((at) => b.some((bt) => tokenClose(at, bt)));
}

function getCellText(row, colIndex1Based) {
  if (!colIndex1Based) return '';
  const cell = row.getCell(colIndex1Based);
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.hyperlink) return String(v.text || v.hyperlink || '').trim();
    if (v.text) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    return String(v).trim();
  }
  return String(v).trim();
}

function makeHeaderIndexMap(ws, headerRow = 1) {
  const map = new Map();
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = String(
      typeof cell.value === 'object' && cell.value?.text != null
        ? cell.value.text
        : cell.value ?? ''
    ).trim();
    if (key && !map.has(key)) map.set(key, col);
  });
  return map;
}

function findCol(headerMap, aliases) {
  const aliasSet = new Set(aliases.map(normalizeHeaderKey));
  for (const [header, col] of headerMap.entries()) {
    if (aliasSet.has(normalizeHeaderKey(header))) return col;
  }
  for (const [header, col] of headerMap.entries()) {
    const n = normalizeHeaderKey(header);
    for (const a of aliasSet) {
      if (a.length < 4) continue;
      if (n === a || n.includes(a)) return col;
    }
  }
  return null;
}

function findSubcategoriesWorksheet(wb) {
  const names = ['Subcategories', 'Sub Categories', 'Subcategory', 'Sub-Categories'];
  for (const name of names) {
    const ws = wb.getWorksheet(name);
    if (ws) return ws;
  }
  for (const ws of wb.worksheets || []) {
    const n = normalizeHeaderKey(ws.name);
    if (n === 'subcategories' || n === 'sub categories') return ws;
  }
  return null;
}

function isInstructionOrEmptyName(name) {
  const t = normalizeName(name);
  if (!t) return true;
  return (
    t === 'mandatory' ||
    t === 'optional' ||
    t === 'title, description' ||
    t.includes('sub-category banner name') ||
    t.includes('sub category banner name') ||
    t.includes('subcategory name')
  );
}

function isPlaceholderUrl(url) {
  const t = String(url || '').trim().toLowerCase();
  return !t || t === 'link' || t === 'n/a' || t === 'na' || t === '-';
}

async function upsertSubcategoryMedia({ subcategory, bannerImage, bannerVideo, youtubeUrl, raw, session }) {
  const setFields = {};
  if (bannerImage !== undefined && !isPlaceholderUrl(bannerImage)) {
    setFields.bannerImage = String(bannerImage).trim();
  }
  if (bannerVideo !== undefined && !isPlaceholderUrl(bannerVideo)) {
    setFields.bannerVideo = String(bannerVideo).trim();
  }
  if (youtubeUrl !== undefined && !isPlaceholderUrl(youtubeUrl)) {
    setFields.youtubeUrl = String(youtubeUrl).trim();
  }
  if (Object.keys(setFields).length === 0) return false;

  const catUpdate = Category.updateOne({ _id: subcategory._id, level: 2 }, { $set: setFields });
  if (session) catUpdate.session(session);
  await catUpdate;

  const mediaQ = CategoryMedia.findOneAndUpdate(
    { categoryId: subcategory._id },
    {
      $set: {
        ...setFields,
        level: 2,
        isActive: true,
        ...(raw ? { importRaw: raw } : {}),
      },
      $setOnInsert: { categoryId: subcategory._id },
    },
    { upsert: true, new: true }
  );
  if (session) mediaQ.session(session);
  await mediaQ;
  return true;
}

/**
 * Resolve SubCategory (level 2) by name from sheet.
 * 1) Exact case-insensitive match
 * 2) Soft match after stripping promotional suffixes
 * 3) Prefix / token overlap (unique best candidate only)
 * Never matches L1 categories. Never uses hardcoded name maps.
 */
function resolveSubcategory(sheetName, subcategories) {
  const exact = exactMatchKey(sheetName);
  const soft = softMatchKey(sheetName);
  if (!exact && !soft) return null;

  const byExact = subcategories.find((c) => exactMatchKey(c.name) === exact);
  if (byExact) return { subcategory: byExact, how: 'exact' };

  const bySoft = subcategories.find((c) => softMatchKey(c.name) === soft);
  if (bySoft) return { subcategory: bySoft, how: 'soft' };

  // Prefix / contains only when one side starts with the other and length is meaningful
  const prefixHits = subcategories
    .map((c) => {
      const ck = softMatchKey(c.name);
      if (!ck || !soft) return null;
      if (ck === soft) return { subcategory: c, score: 100 };
      if (soft.length >= 4 && ck.startsWith(soft)) return { subcategory: c, score: 80 };
      if (ck.length >= 4 && soft.startsWith(ck)) return { subcategory: c, score: 75 };
      // whole soft key appears as a space-bounded token inside L2 (e.g. Oil → Oil & Ghee)
      if (soft.length >= 3 && new RegExp(`(?:^|\\s)${soft.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(ck)) {
        return { subcategory: c, score: 70 };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (prefixHits[0] && prefixHits[0].score >= 70) {
    // Require uniqueness when score is token-in-name (70) to avoid ambiguous Oil→multiple
    const top = prefixHits[0].score;
    const tied = prefixHits.filter((h) => h.score === top);
    if (tied.length === 1) {
      return { subcategory: tied[0].subcategory, how: top >= 75 ? 'prefix' : 'token' };
    }
  }

  const sheetTokens = matchTokens(sheetName);
  if (sheetTokens.length) {
    const tokenHits = subcategories
      .map((c) => {
        const catTokens = matchTokens(c.name);
        const ck = softMatchKey(c.name);
        if (!ck) return null;

        // Single meaningful sheet token: only if L2 starts with it or L2 is the same single token
        // (avoids Essential → Daily Essentials; allows Mangoes → Mango Varieties, Climber → Climbers)
        if (sheetTokens.length === 1) {
          const t = sheetTokens[0];
          const starts = ck.startsWith(t) || catTokens[0] === t;
          const sameSingleton = catTokens.length === 1 && (catTokens[0] === t || t.startsWith(catTokens[0]) || catTokens[0].startsWith(t));
          if (!starts && !sameSingleton) return null;
          return { subcategory: c, score: sameSingleton ? 2 : 1 };
        }

        if (!tokensCompatible(sheetTokens, catTokens)) return null;
        const overlap = sheetTokens.filter((t) =>
          catTokens.some((ct) => tokensCompatible([t], [ct]))
        ).length;
        return { subcategory: c, score: overlap };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    if (tokenHits[0] && tokenHits[0].score > 0) {
      const top = tokenHits[0].score;
      const tied = tokenHits.filter((h) => h.score === top);
      if (tied.length === 1) {
        return { subcategory: tied[0].subcategory, how: 'tokens' };
      }
    }
  }

  return null;
}

/**
 * Import only the Subcategories sheet → SubCategory (L2) media.
 */
async function importSubcategoriesSheet(wb, { session, counts, warnings, errors }) {
  const ws = findSubcategoriesWorksheet(wb);
  if (!ws) {
    warnings.push({
      sheet: 'Subcategories',
      message: 'Sheet "Subcategories" not found — subcategory banner/video/YouTube skipped',
    });
    return { sheet: null, upserted: 0 };
  }

  const sheetLabel = ws.name;
  counts.subcategoryMedia = counts.subcategoryMedia || { upserted: 0, skipped: 0, unmatched: 0 };
  counts.categoryMedia = counts.categoryMedia || { upserted: 0, skipped: 0, sheets: [] };
  counts.categoryMedia.sheets = counts.categoryMedia.sheets || [];
  if (!counts.categoryMedia.sheets.includes(sheetLabel)) {
    counts.categoryMedia.sheets.push(sheetLabel);
  }

  const headerMap = makeHeaderIndexMap(ws, 1);
  const nameCol = findCol(headerMap, [
    'Sub-Category Banner Name',
    'Sub Category Banner Name',
    'SubCategory Banner Name',
    'Sub-Category Name',
    'Sub Category Name',
    'SubCategory Name',
    'Subcategory Name',
    'Banner Name',
  ]);
  const imageCol = findCol(headerMap, [
    'Sub-Category Banner URL',
    'Sub Category Banner URL',
    'SubCategory Banner URL',
    'Banner Image URL',
    'Banner URL',
  ]);
  const videoCol = findCol(headerMap, ['video', 'Banner Video URL', 'Banner Video', 'Video URL']);
  const youtubeCol = findCol(headerMap, [
    'youtube video link',
    'YouTube URL',
    'Youtube URL',
    'YouTube Link',
    'Youtube Link',
  ]);
  const bannerIdCol = findCol(headerMap, ['Banner ID', 'BannerID']);

  if (!nameCol) {
    errors.push({
      sheet: sheetLabel,
      message: `Missing Sub-Category name column. Found headers: ${[...headerMap.keys()].join(', ')}`,
    });
    return { sheet: sheetLabel, upserted: 0 };
  }

  const q = Category.find({ isActive: true, level: 2 }).select('_id name slug level parentId').lean();
  if (session) q.session(session);
  const subcategories = await q;

  let upserted = 0;

  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const name = getCellText(row, nameCol);
    if (isInstructionOrEmptyName(name)) {
      counts.subcategoryMedia.skipped += 1;
      continue;
    }

    const bannerImage = imageCol ? getCellText(row, imageCol) : '';
    const bannerVideo = videoCol ? getCellText(row, videoCol) : '';
    const youtubeUrl = youtubeCol ? getCellText(row, youtubeCol) : '';
    const bannerId = bannerIdCol ? getCellText(row, bannerIdCol) : '';

    const hasAny =
      (!isPlaceholderUrl(bannerImage) && bannerImage) ||
      (!isPlaceholderUrl(bannerVideo) && bannerVideo) ||
      (!isPlaceholderUrl(youtubeUrl) && youtubeUrl);

    if (!hasAny) {
      counts.subcategoryMedia.skipped += 1;
      continue;
    }

    const resolved = resolveSubcategory(name, subcategories);
    if (!resolved) {
      warnings.push({
        sheet: sheetLabel,
        row: r,
        message: `SubCategory not found for "${name}"${bannerId ? ` (${bannerId})` : ''} — media skipped`,
      });
      counts.subcategoryMedia.unmatched += 1;
      counts.subcategoryMedia.skipped += 1;
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const ok = await upsertSubcategoryMedia({
        subcategory: resolved.subcategory,
        bannerImage: bannerImage || undefined,
        bannerVideo: bannerVideo || undefined,
        youtubeUrl: youtubeUrl || undefined,
        raw: {
          bannerId,
          sheetName: name,
          matchedSubCategory: resolved.subcategory.name,
          matchHow: resolved.how,
          bannerImage,
          bannerVideo,
          youtubeUrl,
        },
        session,
      });
      if (ok) upserted += 1;
      else counts.subcategoryMedia.skipped += 1;
    } catch (e) {
      errors.push({ sheet: sheetLabel, row: r, message: e.message || String(e) });
    }
  }

  counts.subcategoryMedia.upserted = upserted;
  counts.categoryMedia.upserted = upserted;

  warnings.push({
    sheet: sheetLabel,
    message: `SubCategory media: imported ${upserted}, unmatched ${counts.subcategoryMedia.unmatched}, skipped ${counts.subcategoryMedia.skipped}`,
  });

  return { sheet: sheetLabel, upserted };
}

/**
 * Entry used by Content Hub + SKU Master imports.
 * Only Subcategories sheet — never Category-level media.
 */
async function applyCategoryMediaSheets(wb, ctx = {}) {
  const { session = null, counts = {}, warnings = [], errors = [] } = ctx;
  counts.subcategoryMedia = counts.subcategoryMedia || { upserted: 0, skipped: 0, unmatched: 0 };
  counts.categoryMedia = counts.categoryMedia || { upserted: 0, skipped: 0, sheets: [] };

  await importSubcategoriesSheet(wb, { session, counts, warnings, errors });
  return counts.subcategoryMedia;
}

module.exports = {
  applyCategoryMediaSheets,
  importSubcategoriesSheet,
  resolveSubcategory,
  exactMatchKey,
  softMatchKey,
};
