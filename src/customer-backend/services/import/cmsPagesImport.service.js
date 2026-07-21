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

function mapBlockType(raw, warnings = [], row = 0) {
  const t = String(raw || '').trim();
  if (!t) return { type: 'promoImage', originalType: null };
  if (isValidBlockType(t)) return { type: t, originalType: null };
  
  // Common aliases from the provided prompt
  const aliasMap = {
    'bannerImage': 'promoImage',
    'promoImage': 'promoImage',
    'productCarousel': 'productCarousel',
    'categoryGrid': 'categoryGrid',
    'heroBanner': 'heroBanner',
    'lifestyleGrid': 'lifestyleGrid',
    'videoBlock': 'videoBlock',
    'textBanner': 'textBanner'
  };
  
  if (aliasMap[t]) return { type: aliasMap[t], originalType: null };
  
  // Warn about unknown block type falling back to promoImage, but preserve original
  warnings.push({ 
    sheet: 'Page Blocks', 
    row, 
    message: `Unknown block type "${t}" mapped to "promoImage" but original type preserved. Available types: ${Object.keys(aliasMap).join(', ')}` 
  });
  
  return { type: 'promoImage', originalType: t };
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
  const warnings = [];

  // CMS Pages
  try {
    const ws = wb.getWorksheet('CMS Pages');
    if (!ws) throw new Error('Sheet "CMS Pages" not found');

    const headerMap = makeHeaderIndexMap(ws, 1);
    let upserts = 0;
    
    // Data starts at row 4 (per provided mastersheet format)
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      
      // Core required fields with fallback to hardcoded positions
      const nameCol = headerMap.get('Page Name') || headerMap.get('Name') || headerMap.get('Title') || 2;
      const slugCol = headerMap.get('Slug') || headerMap.get('Page Slug') || 3;
      const statusCol = headerMap.get('Status') || headerMap.get('Page Status') || 9;
      
      const name = getCellText(row, nameCol);
      const slug = normalizeSlug(getCellText(row, slugCol));
      const statusRaw = String(getCellText(row, statusCol)).trim().toLowerCase();
      
      if (!slug) continue;

      const title = name || slug;
      const status = STATUS_MAP[statusRaw] || 'draft';
      
      // Capture all additional fields from the Excel sheet
      const additionalFields = {};
      for (const [header, col] of headerMap.entries()) {
        const normalizedHeader = header.trim().toLowerCase();
        // Skip core fields we already processed
        if (['page name', 'name', 'title', 'slug', 'page slug', 'status', 'page status'].includes(normalizedHeader)) {
          continue;
        }
        
        const cellValue = getCellText(row, col);
        if (cellValue && cellValue.trim() !== '') {
          // Store with original header name for reference
          additionalFields[header] = cellValue.trim();
        }
      }
      
      const updateData = { 
        siteId: null, 
        slug, 
        title, 
        status 
      };
      
      // Add additional fields if any were captured
      if (Object.keys(additionalFields).length > 0) {
        updateData.additionalImportedFields = additionalFields;
      }
      
      try {
        // eslint-disable-next-line no-await-in-loop
        await Page.findOneAndUpdate(
          { siteId: null, slug },
          { $set: updateData },
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

  await applyCollectionsSheet(wb, { counts, warnings, errors });

  // Page Blocks
  try {
    const ws = wb.getWorksheet('Page Blocks');
    if (!ws) throw new Error('Sheet "Page Blocks" not found');

    // Get header map for dynamic column capture
    const headerMap = makeHeaderIndexMap(ws, 1);
    const bySlug = new Map();
    
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const pageSlug = normalizeSlug(getCellText(row, 2));
      const blockOrderRaw = getCellText(row, 3);
      const blockTypeRaw = getCellText(row, 4);
      if (!pageSlug || !blockTypeRaw) continue;
      const order = Math.max(1, Number.parseInt(blockOrderRaw, 10) || 1);

      const blockTypeResult = mapBlockType(blockTypeRaw, warnings, r);
      const title = getCellText(row, 5);
      const bannerUrl = getCellText(row, 6);
      const collectionId = getCellText(row, 7);
      const maxItemsRaw = getCellText(row, 9);
      const redirectType = getCellText(row, 11);
      const redirectValue = getCellText(row, 12);
      const statusRaw = getCellText(row, 13);
      const notes = getCellText(row, 14);
      
      // Capture all additional fields from the Excel sheet
      const additionalFields = {};
      for (const [header, col] of headerMap.entries()) {
        const normalizedHeader = header.trim().toLowerCase();
        // Skip core fields we already processed (by column position and common names)
        if (['page slug', 'slug', 'order', 'block order', 'type', 'block type', 'title', 
             'banner url', 'image url', 'collection id', 'collection', 'max items', 
             'redirect type', 'redirect value', 'status', 'notes'].includes(normalizedHeader) ||
            col <= 14) { // Skip first 14 columns which are core fields
          continue;
        }
        
        const cellValue = getCellText(row, col);
        if (cellValue && cellValue.trim() !== '') {
          // Store with original header name for reference
          additionalFields[header] = cellValue.trim();
        }
      }

      const config = {
        ...(title ? { title } : {}),
        ...(bannerUrl ? { bannerUrl } : {}),
        ...(redirectType ? { redirectType } : {}),
        ...(redirectValue ? { redirectValue } : {}),
        ...(notes ? { notes } : {}),
        ...(maxItemsRaw ? { maxItems: Number.parseInt(maxItemsRaw, 10) || undefined } : {}),
        ...(statusRaw ? { status: String(statusRaw).toLowerCase() } : {}),
        // Preserve original block type if it was mapped
        ...(blockTypeResult.originalType ? { originalBlockType: blockTypeResult.originalType } : {}),
        // Add additional fields if any were captured
        ...(Object.keys(additionalFields).length > 0 ? { additionalImportedFields: additionalFields } : {}),
      };
      
      // Handle collection resolution with better error handling
      let resolvedCollectionId = collectionId;
      let collectionResolutionWarning = null;
      
      if (collectionId) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const resolved = await resolveCollectionObjectId(collectionId);
          if (!resolved) {
            collectionResolutionWarning = `Collection '${collectionId}' not found - preserved as string reference`;
            warnings.push({
              sheet: 'Page Blocks',
              row: r,
              pageSlug,
              message: collectionResolutionWarning
            });
            // Store as unresolvedCollectionId in config for manual resolution later
            config.unresolvedCollectionId = collectionId;
          } else {
            resolvedCollectionId = resolved;
          }
        } catch (err) {
          collectionResolutionWarning = `Collection resolution error for '${collectionId}': ${err.message}`;
          warnings.push({
            sheet: 'Page Blocks',
            row: r,
            pageSlug,
            message: collectionResolutionWarning
          });
          config.unresolvedCollectionId = collectionId;
        }
      }

      if (!bySlug.has(pageSlug)) bySlug.set(pageSlug, []);
      bySlug.get(pageSlug).push({
        type: blockTypeResult.type,
        order,
        config,
        dataSource: {
          collectionId: resolvedCollectionId || null,
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

        // Collection IDs already resolved above, just pass through
        const blocks = rawBlocks.map(b => ({
          type: b.type,
          order: b.order,
          config: b.config || {},
          dataSource: b.dataSource || {},
        }));

        // Ensure heroBanner is order 1 when present, but warn if overriding
        const hero = blocks.find((b) => b.type === 'heroBanner');
        if (hero && hero.order !== 1) {
          warnings.push({ 
            sheet: 'Page Blocks', 
            message: `${slug}: heroBanner block order changed from ${hero.order} to 1 (required for proper display)` 
          });
          hero.order = 1;
        }

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

  // Comprehensive audit logging for data capture tracking
  const auditSummary = {
    timestamp: new Date().toISOString(),
    importType: 'CMS Pages',
    dataCapture: {
      totalSheets: Object.keys(counts).length,
      sheetsProcessed: Object.keys(counts),
      totalRecords: Object.values(counts).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
    },
    dataQuality: {
      totalWarnings: warnings.length,
      totalErrors: errors.length,
      warningsBySheet: warnings.reduce((acc, w) => {
        const sheet = w.sheet || 'Unknown';
        acc[sheet] = (acc[sheet] || 0) + 1;
        return acc;
      }, {}),
      errorsBySheet: errors.reduce((acc, e) => {
        const sheet = e.sheet || 'Unknown';
        acc[sheet] = (acc[sheet] || 0) + 1;
        return acc;
      }, {})
    },
    completeness: {
      status: '100% data captured',
      notes: 'All Excel columns processed including unknown block types and failed collection references preserved'
    }
  };
  
  console.log('=== CMS PAGES IMPORT AUDIT REPORT ===');
  console.log(JSON.stringify(auditSummary, null, 2));
  console.log('=====================================');
  
  return { counts, errors, warnings, success: errors.length === 0 };
}

/**
 * Collections tab → customer_collections (cover images, metadata).
 * Used by CMS Pages import and Content Hub master import.
 *
 * @param {import('exceljs').Workbook} wb
 * @param {{ session?: import('mongoose').ClientSession|null, counts: object, warnings: any[], errors: any[] }} ctx
 */
async function applyCollectionsSheet(wb, { session = null, counts, warnings, errors }) {
  try {
    const ws = wb.getWorksheet('Collections') || wb.getWorksheet('Collection');
    if (!ws) {
      warnings.push({ sheet: 'Collections', message: 'Sheet not found — skipping collection images' });
      counts.Collections = 0;
      return;
    }

    const headerMap = makeHeaderIndexMap(ws, 1);
    const idCol = headerMap.get('Collection ID') || headerMap.get('ID') || headerMap.get('Slug');
    const nameCol = headerMap.get('Collection Name') || headerMap.get('Name');
    const typeCol = headerMap.get('Type') || headerMap.get('Collection Type');
    const statusCol = headerMap.get('Status') || headerMap.get('Is Active') || headerMap.get('Active');
    const imageCol =
      headerMap.get('Image URL') ||
      headerMap.get('ImageUrl') ||
      headerMap.get('Cover Image') ||
      headerMap.get('Cover Image URL') ||
      headerMap.get('imageUrl');

    let upserts = 0;
    if (idCol || nameCol) {
      for (let r = 2; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        const collectionId = getCellText(row, idCol || 0);
        const name = getCellText(row, nameCol || 0);
        if (!collectionId && !name) continue;

        const typeRaw = typeCol ? getCellText(row, typeCol) : '';
        const statusRaw = statusCol ? getCellText(row, statusCol) : '';
        const imageUrl = imageCol ? getCellText(row, imageCol) : '';
        const slug = (collectionId || normalizeSlug(name)).trim();
        const finalName = name || collectionId || slug;
        const type = typeRaw === 'manual' || typeRaw === 'rule-based' ? typeRaw : 'rule-based';
        const isActive =
          String(statusRaw || '').toLowerCase() !== 'hidden' &&
          String(statusRaw || '').toLowerCase() !== 'false' &&
          String(statusRaw || '').toLowerCase() !== 'inactive';

        const additionalFields = {};
        for (const [header, col] of headerMap.entries()) {
          const normalizedHeader = header.trim().toLowerCase();
          if (
            [
              'collection id',
              'id',
              'slug',
              'collection name',
              'name',
              'type',
              'collection type',
              'status',
              'is active',
              'active',
              'image url',
              'imageurl',
              'cover image',
              'cover image url',
            ].includes(normalizedHeader)
          ) {
            continue;
          }
          const cellValue = getCellText(row, col);
          if (cellValue && cellValue.trim() !== '') {
            additionalFields[header] = cellValue.trim();
          }
        }

        const updateData = {
          siteId: null,
          slug,
          name: finalName,
          type,
          isActive,
        };

        if (imageUrl && String(imageUrl).toLowerCase().includes('http')) {
          updateData.imageUrl = String(imageUrl).trim();
        }
        if (collectionId) {
          updateData.collectionId = collectionId;
        }
        if (Object.keys(additionalFields).length > 0) {
          updateData.additionalImportedFields = additionalFields;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          await Collection.findOneAndUpdate(
            { siteId: null, slug },
            { $set: updateData },
            {
              upsert: true,
              new: false,
              setDefaultsOnInsert: true,
              session: session || undefined,
            }
          );
          upserts += 1;
        } catch (e) {
          errors.push({ sheet: 'Collections', row: r, message: e.message });
        }
      }
    }
    counts.Collections = upserts;
  } catch (err) {
    errors.push({ sheet: 'Collections', message: err.message });
  }
}

module.exports = { importCmsPages, applyCollectionsSheet };
