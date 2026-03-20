const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const { Page } = require('../../models/Page');
const { Collection } = require('../../models/Collection');
const { isValidBlockType } = require('../../shared/constants');

const STATUS_MAP = {
  active: 'published',
  published: 'published',
  draft: 'draft',
  hidden: 'draft',
};

function normalizeSlug(val) {
  if (!val) return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, '-');
}

function getCellText(row, colIndex1Based) {
  const cell = row.getCell(colIndex1Based);
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  return String(v).trim();
}

function makeHeaderIndexMap(worksheet, headerRowNumber = 1) {
  const headerRow = worksheet.getRow(headerRowNumber);
  const map = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const raw = cell?.value;
    const text =
      raw && typeof raw === 'object' && raw.text ? String(raw.text) : raw != null ? String(raw) : '';
    const key = text.trim();
    if (key) map.set(key, colNumber);
  });
  return map;
}

function mapBlockType(raw) {
  const t = String(raw || '').trim();
  if (!t) return 'promoImage';
  if (isValidBlockType(t)) return t;
  // Common aliases from the provided prompt
  if (t === 'bannerImage') return 'promoImage';
  if (t === 'promoImage') return 'promoImage';
  if (t === 'productCarousel') return 'productCarousel';
  if (t === 'categoryGrid') return 'categoryGrid';
  if (t === 'heroBanner') return 'heroBanner';
  if (t === 'lifestyleGrid') return 'lifestyleGrid';
  if (t === 'videoBlock') return 'videoBlock';
  if (t === 'textBanner') return 'textBanner';
  return 'promoImage';
}

async function resolveCollectionObjectId(collectionIdOrSlug) {
  if (!collectionIdOrSlug) return null;
  const s = String(collectionIdOrSlug).trim();
  if (!s) return null;
  if (mongoose.Types.ObjectId.isValid(s)) return s;
  const col = await Collection.findOne({ slug: s }).select('_id').lean();
  return col?._id ? String(col._id) : null;
}

async function importCmsPages(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const counts = {};
  const errors = [];

  // CMS Pages
  try {
    const ws = wb.getWorksheet('CMS Pages');
    if (!ws) throw new Error('Sheet "CMS Pages" not found');

    let upserts = 0;
    // Data starts at row 4 (per provided mastersheet format)
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = getCellText(row, 2);
      const slug = normalizeSlug(getCellText(row, 3));
      const statusRaw = String(getCellText(row, 9)).trim().toLowerCase();
      if (!slug) continue;

      const title = name || slug;
      const status = STATUS_MAP[statusRaw] || 'draft';
      try {
        // eslint-disable-next-line no-await-in-loop
        await Page.findOneAndUpdate(
          { siteId: null, slug },
          { $set: { siteId: null, slug, title, status } },
          { upsert: true, new: false, setDefaultsOnInsert: true }
        );
        upserts += 1;
      } catch (e) {
        errors.push({ sheet: 'CMS Pages', row: r, message: e.message });
      }
    }
    counts['CMS Pages'] = upserts;
  } catch (err) {
    errors.push({ sheet: 'CMS Pages', message: err.message });
  }

  // Collections
  try {
    const ws = wb.getWorksheet('Collections');
    if (ws) {
      const headerMap = makeHeaderIndexMap(ws, 1);
      const idCol = headerMap.get('Collection ID');
      const nameCol = headerMap.get('Collection Name');
      const typeCol = headerMap.get('Type');
      const statusCol = headerMap.get('Status');

      let upserts = 0;
      if (idCol) {
        for (let r = 2; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const collectionId = getCellText(row, idCol);
          if (!collectionId) continue;
          const name = nameCol ? getCellText(row, nameCol) : '';
          const typeRaw = typeCol ? getCellText(row, typeCol) : '';
          const statusRaw = statusCol ? getCellText(row, statusCol) : '';
          const type = typeRaw === 'manual' || typeRaw === 'rule-based' ? typeRaw : 'rule-based';
          const isActive = String(statusRaw || '').toLowerCase() !== 'hidden';
          try {
            // eslint-disable-next-line no-await-in-loop
            await Collection.findOneAndUpdate(
              { siteId: null, slug: collectionId.trim() },
              {
                $set: {
                  siteId: null,
                  slug: collectionId.trim(),
                  name: name || collectionId.trim(),
                  type,
                  isActive,
                },
              },
              { upsert: true, new: false, setDefaultsOnInsert: true }
            );
            upserts += 1;
          } catch (e) {
            errors.push({ sheet: 'Collections', row: r, message: e.message });
          }
        }
      }
      counts.Collections = upserts;
    }
  } catch (err) {
    errors.push({ sheet: 'Collections', message: err.message });
  }

  // Page Blocks
  try {
    const ws = wb.getWorksheet('Page Blocks');
    if (!ws) throw new Error('Sheet "Page Blocks" not found');

    const bySlug = new Map();
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const pageSlug = normalizeSlug(getCellText(row, 2));
      const blockOrderRaw = getCellText(row, 3);
      const blockTypeRaw = getCellText(row, 4);
      if (!pageSlug || !blockTypeRaw) continue;
      const order = Math.max(1, Number.parseInt(blockOrderRaw, 10) || 1);

      const blockType = mapBlockType(blockTypeRaw);
      const title = getCellText(row, 5);
      const bannerUrl = getCellText(row, 6);
      const collectionId = getCellText(row, 7);
      const maxItemsRaw = getCellText(row, 9);
      const redirectType = getCellText(row, 11);
      const redirectValue = getCellText(row, 12);
      const statusRaw = getCellText(row, 13);
      const notes = getCellText(row, 14);

      if (!bySlug.has(pageSlug)) bySlug.set(pageSlug, []);
      bySlug.get(pageSlug).push({
        type: blockType,
        order,
        config: {
          ...(title ? { title } : {}),
          ...(bannerUrl ? { bannerUrl } : {}),
          ...(redirectType ? { redirectType } : {}),
          ...(redirectValue ? { redirectValue } : {}),
          ...(notes ? { notes } : {}),
          ...(maxItemsRaw ? { maxItems: Number.parseInt(maxItemsRaw, 10) || undefined } : {}),
          ...(statusRaw ? { status: String(statusRaw).toLowerCase() } : {}),
        },
        dataSource: {
          collectionId: collectionId || null,
        },
      });
    }

    let pagesUpdated = 0;
    let blocksImported = 0;

    for (const [slug, rawBlocks] of bySlug.entries()) {
      try {
        // Ensure page exists
        // eslint-disable-next-line no-await-in-loop
        const page = await Page.findOneAndUpdate(
          { siteId: null, slug },
          { $setOnInsert: { siteId: null, slug, title: slug, status: 'draft' } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        // Resolve collection IDs
        const blocks = [];
        for (const b of rawBlocks) {
          let collectionObjectId = null;
          if (b.dataSource?.collectionId) {
            // eslint-disable-next-line no-await-in-loop
            collectionObjectId = await resolveCollectionObjectId(b.dataSource.collectionId);
          }
          blocks.push({
            type: b.type,
            order: b.order,
            config: b.config || {},
            dataSource: {
              ...(collectionObjectId ? { collectionId: collectionObjectId } : {}),
            },
          });
        }

        // Ensure heroBanner is order 1 when present
        const hero = blocks.find((b) => b.type === 'heroBanner');
        if (hero) hero.order = 1;

        // Normalize ordering: stable sort by order and then re-number starting at 1
        blocks.sort((a, b) => (a.order || 1) - (b.order || 1));
        blocks.forEach((b, i) => {
          b.order = i + 1;
        });

        // eslint-disable-next-line no-await-in-loop
        await Page.findByIdAndUpdate(page._id, { $set: { blocks } }, { new: false });
        pagesUpdated += 1;
        blocksImported += blocks.length;
      } catch (e) {
        errors.push({ sheet: 'Page Blocks', message: `${slug}: ${e.message}` });
      }
    }

    counts['Page Blocks'] = blocksImported;
    counts.pagesUpdated = pagesUpdated;
  } catch (err) {
    errors.push({ sheet: 'Page Blocks', message: err.message });
  }

  return { counts, errors };
}

module.exports = { importCmsPages };

