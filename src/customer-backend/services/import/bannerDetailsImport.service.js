/**
 * Banner Details tab → customer_banners
 *
 * Two template shapes are supported (auto-detected by header row contents):
 *
 *   A) Legacy operational sheet
 *      Headers: slot | presentationMode | isNavigable | title | imageUrl | redirectType | redirectValue | ...
 *      Rows describe a banner's placement (slot=hero/mid/etc.) directly. Upsert by (slot, order).
 *
 *   B) New "Selorg_Final_Template" content sheet
 *      Header row is row 2 (row 1 is a merged-label spacer). Headers:
 *      Banner ID | Banner URL | Banner Type | Banner Name | Banner Size | Name | Section 1..8
 *      Each row is a banner asset identified by Banner.bannerId (e.g. Ban-051). Section 1..8
 *      are inline content references that are out of scope for now. Upsert by bannerId; slot
 *      defaults to 'mid' (Home Page Content tab governs placement).
 */

const mongoose = require('mongoose');
const { Banner } = require('../../models/Banner');
const { Category } = require('../../models/Category');

function getCellText(row, col) {
  if (col == null) return '';
  const cell = row.getCell(col);
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  return String(v).trim();
}

function parseBoolean(raw, fallback = false) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (!t) return fallback;
  if (t === 'TRUE' || t === 'T' || t === 'Y' || t === 'YES' || t === '1') return true;
  if (t === 'FALSE' || t === 'F' || t === 'N' || t === 'NO' || t === '0') return false;
  return fallback;
}

function parseDateCell(cellValue) {
  if (!cellValue) return undefined;
  if (cellValue instanceof Date) return cellValue;
  const s = String(cellValue).trim();
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapBannerContentType(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const allowed = new Set(['banner', 'video', 'image', 'text', 'products']);
  if (allowed.has(t)) return t;
  if (t === 'productCarousel') return 'products';
  if (t === 'bannerImage' || t === 'promoImage') return 'image';
  return t;
}

function normalizeHeaderKey(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[()]/g, '');
}

function rowToHeaderMap(ws, rowNumber) {
  const row = ws.getRow(rowNumber);
  const map = new Map();
  row.eachCell((cell, col) => {
    const raw = cell?.value;
    const text = raw && typeof raw === 'object' && raw.text ? String(raw.text) : raw != null ? String(raw) : '';
    const key = text.trim();
    if (key) map.set(key, col);
  });
  return map;
}

function findCol(headerMap, aliases) {
  for (const a of aliases) {
    if (headerMap.has(a)) return headerMap.get(a);
  }
  const normalized = aliases.map(normalizeHeaderKey);
  for (const [k, v] of headerMap.entries()) {
    if (normalized.includes(normalizeHeaderKey(k))) return v;
  }
  return null;
}

/**
 * Detect format and header row index.
 * Scans rows 1..3 looking for a recognizable header.
 *   - "Banner ID" / "BannerID" anywhere → new template (header at that row)
 *   - "slot" anywhere → legacy
 */
function detectBannerSheet(ws) {
  for (let r = 1; r <= Math.min(3, ws.rowCount); r += 1) {
    const headerMap = rowToHeaderMap(ws, r);
    if (findCol(headerMap, ['Banner ID', 'BannerID', 'bannerId']) != null) {
      return { format: 'new', headerRow: r, headerMap };
    }
    if (findCol(headerMap, ['slot', 'Slot']) != null) {
      return { format: 'legacy', headerRow: r, headerMap };
    }
  }
  return null;
}

// ─── Legacy slot-based parser ───────────────────────────────────────────────

async function applyLegacyBanners(ws, headerMap, ctx) {
  const { counts, errors, session } = ctx;
  const slotCol = findCol(headerMap, ['slot', 'Slot']) ?? 1;
  const presModeCol = findCol(headerMap, ['presentationMode', 'Presentation Mode']) ?? 2;
  const isNavigableCol = findCol(headerMap, ['isNavigable', 'Is Navigable']) ?? 3;
  const titleCol = findCol(headerMap, ['title', 'Title']) ?? 4;
  const imageUrlCol =
    findCol(headerMap, ['imageUrl', 'Image URL', 'ImageUrl', 'Banner Image URL', 'Banner URL', 'Image']) ?? 5;
  const redirectTypeCol = findCol(headerMap, ['redirectType', 'Redirect Type']) ?? 6;
  const redirectValueCol = findCol(headerMap, ['redirectValue', 'Redirect Value']) ?? 7;
  const isActiveCol = findCol(headerMap, ['isActive', 'Is Active']) ?? 8;
  const startDateCol = findCol(headerMap, ['startDate', 'Start Date']) ?? 9;
  const endDateCol = findCol(headerMap, ['endDate', 'End Date']) ?? 10;
  const orderCol = findCol(headerMap, ['order', 'Order']) ?? 11;
  const contentTypeCol = findCol(headerMap, ['contentItems.type', 'Content Type']) ?? 12;
  const contentImageUrlCol = findCol(headerMap, ['contentItems.imageUrl', 'Content Image URL']) ?? 13;
  const contentBlockTitleCol = findCol(headerMap, ['contentItems.blockTitle', 'Content Block Title']) ?? 14;
  const contentLinkCol = findCol(headerMap, ['contentItems.link', 'Content Link']) ?? 15;
  const contentIsNavigableCol = findCol(headerMap, ['contentItems.isNavigable', 'Content Is Navigable']) ?? 16;
  const contentOrderCol = findCol(headerMap, ['contentItems.order', 'Content Order']) ?? 17;

  const allowedSlots = new Set(['hero', 'small', 'mid', 'large', 'info', 'category']);
  const bannerGroups = new Map();

  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const slot = getCellText(row, slotCol).trim().toLowerCase();
    if (!allowedSlots.has(slot)) continue;
    const imageUrl = getCellText(row, imageUrlCol);
    if (!imageUrl || !imageUrl.toLowerCase().includes('http')) continue;
    const order = Number.parseInt(getCellText(row, orderCol), 10) || (r - 1);
    const key = `${slot}|${order}`;
    if (!bannerGroups.has(key)) {
      bannerGroups.set(key, {
        slot,
        presentationMode: (getCellText(row, presModeCol) || 'single') === 'carousel' ? 'carousel' : 'single',
        isNavigable: parseBoolean(getCellText(row, isNavigableCol), true),
        title: getCellText(row, titleCol),
        imageUrl,
        redirectType: getCellText(row, redirectTypeCol) || null,
        redirectValue: getCellText(row, redirectValueCol) || null,
        isActive: parseBoolean(getCellText(row, isActiveCol), true),
        startDate: parseDateCell(row.getCell(startDateCol)?.value),
        endDate: parseDateCell(row.getCell(endDateCol)?.value),
        order,
        contentItems: [],
      });
    }
    const contentType = mapBannerContentType(getCellText(row, contentTypeCol));
    const contentImageUrl = getCellText(row, contentImageUrlCol);
    const contentBlockTitle = getCellText(row, contentBlockTitleCol);
    const contentLink = getCellText(row, contentLinkCol);
    if (contentType && (contentImageUrl || contentBlockTitle || contentLink)) {
      bannerGroups.get(key).contentItems.push({
        type: contentType,
        order: Number.parseInt(getCellText(row, contentOrderCol), 10) || 1,
        imageUrl: contentImageUrl || undefined,
        text: contentType === 'text' ? contentBlockTitle || undefined : undefined,
        blockTitle: contentBlockTitle || undefined,
        link: contentLink || undefined,
        isNavigable: parseBoolean(getCellText(row, contentIsNavigableCol), true),
      });
    }
  }

  const allowedRedirectTypes = new Set([
    'url', 'category', 'subcategory', 'collection', 'section', 'product',
    'search', 'none', 'page', 'screen', 'banner',
  ]);

  const resolveCategoryId = async (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    if (mongoose.Types.ObjectId.isValid(v)) {
      const doc = await Category.findById(v).session(session || null).lean();
      return doc?._id ? String(doc._id) : null;
    }
    let doc = await Category.findOne({ slug: v }).session(session || null).lean();
    if (doc?._id) return String(doc._id);
    if (/[A-Za-z]\d+/.test(v)) {
      doc = await Category.findOne({ hierarchyCodes: v }).session(session || null).lean();
      if (doc?._id) return String(doc._id);
    }
    doc = await Category.findOne({ name: v }).session(session || null).lean();
    return doc?._id ? String(doc._id) : null;
  };

  for (const group of bannerGroups.values()) {
    try {
      let categoryId = null;
      if (group.slot === 'category' && group.redirectValue) {
        categoryId = await resolveCategoryId(group.redirectValue);
      }
      group.contentItems.sort((a, b) => (a.order || 1) - (b.order || 1));

      const update = {
        slot: group.slot,
        presentationMode: group.presentationMode,
        isNavigable: group.isNavigable,
        title: group.title,
        imageUrl: group.imageUrl,
        redirectType: group.redirectType && allowedRedirectTypes.has(group.redirectType) ? group.redirectType : null,
        redirectValue: group.redirectValue || null,
        categoryId: categoryId || null,
        isActive: group.isActive,
        ...(group.startDate ? { startDate: group.startDate } : {}),
        ...(group.endDate ? { endDate: group.endDate } : {}),
        order: group.order,
        contentItems: group.contentItems,
      };

      await Banner.findOneAndUpdate(
        { slot: group.slot, order: group.order },
        { $set: update },
        { upsert: true, new: false, session: session || undefined }
      );
      counts.banners.upserted += 1;
    } catch (e) {
      errors.push({ sheet: 'Banner Details', message: e.message });
    }
  }
}

// ─── New "Banner ID"-based parser ───────────────────────────────────────────

async function applyNewBanners(ws, headerMap, headerRow, ctx) {
  const { counts, warnings, errors, session } = ctx;

  const bannerIdCol = findCol(headerMap, ['Banner ID', 'BannerID', 'bannerId']);
  const bannerUrlCol = findCol(headerMap, ['Banner URL', 'Image URL', 'imageUrl', 'BannerURL']);
  const bannerTypeCol = findCol(headerMap, ['Banner Type', 'bannerType', 'Type']);
  const bannerNameCol = findCol(headerMap, ['Banner Name', 'Title', 'title']);
  const bannerSizeCol = findCol(headerMap, ['Banner Size', 'Size']);
  const nameCol = findCol(headerMap, ['Name']);

  if (!bannerIdCol || !bannerUrlCol) {
    errors.push({
      sheet: 'Banner Details',
      message: `Missing required columns "Banner ID" and/or "Banner URL"; found: ${[...headerMap.keys()].join(', ')}`,
    });
    return;
  }

  for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const bannerId = getCellText(row, bannerIdCol);
    const imageUrl = getCellText(row, bannerUrlCol);

    if (!bannerId) continue;
    if (!/^Ban[-_]/i.test(bannerId)) continue; // skip rows where col 1 isn't a banner code

    if (!imageUrl || !imageUrl.toLowerCase().includes('http')) {
      warnings.push({ sheet: 'Banner Details', row: r, bannerId, message: 'Skipped: missing/invalid Banner URL' });
      continue;
    }

    const bannerType = bannerTypeCol ? getCellText(row, bannerTypeCol) : '';
    const bannerName = bannerNameCol ? getCellText(row, bannerNameCol) : '';
    const fallbackName = nameCol ? getCellText(row, nameCol) : '';
    const bannerSize = bannerSizeCol ? getCellText(row, bannerSizeCol) : '';
    const isNavigable = /click/i.test(bannerType);

    try {
      const update = {
        bannerId,
        imageUrl,
        title: bannerName || fallbackName || bannerId,
        bannerType: bannerType || '',
        bannerImageUrl: imageUrl,
        slot: 'mid',
        isNavigable,
        isActive: true,
        ...(bannerSize ? { sectionCode: bannerSize } : {}),
      };
      // Preserve any custom slot/order set in the DB by previous imports/manual edits:
      // upsert by bannerId, but don't override slot/order on existing rows.
      const existing = await Banner.findOne({ bannerId }).session(session || null).lean();
      if (existing) {
        const updateExisting = { ...update };
        delete updateExisting.slot;
        await Banner.updateOne(
          { _id: existing._id },
          { $set: updateExisting },
          { session: session || undefined }
        );
      } else {
        await Banner.create([update], { session: session || undefined });
      }
      counts.banners.upserted += 1;
    } catch (e) {
      errors.push({ sheet: 'Banner Details', row: r, bannerId, message: e.message });
    }
  }
}

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ session?: import('mongoose').ClientSession|null, counts: object, warnings: any[], errors: any[] }} ctx
 */
async function applyBannerDetails(wb, ctx) {
  const ws = wb.getWorksheet('Banner Details') || wb.getWorksheet('Banner');
  if (!ws) {
    ctx.warnings.push({ sheet: 'Banner Details', message: 'Sheet "Banner Details" not found — skipping banners' });
    return;
  }
  const detected = detectBannerSheet(ws);
  if (!detected) {
    ctx.warnings.push({
      sheet: 'Banner Details',
      message: 'Header row not recognized (expected "Banner ID" or "slot"); banners were not imported',
    });
    return;
  }
  if (detected.format === 'new') {
    await applyNewBanners(ws, detected.headerMap, detected.headerRow, ctx);
  } else {
    await applyLegacyBanners(ws, detected.headerMap, ctx);
  }
}

module.exports = { applyBannerDetails, detectBannerSheet };
