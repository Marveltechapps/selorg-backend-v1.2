/**
 * One-off catalog repair after Master Sheet import:
 *  1. Attach orphan hierarchy codes (SKU Master codes with no Categories-sheet leaf) to the
 *     correct level-2 subcategories, and link the affected products to them.
 *  2. Promote one SKU to `classification: 'Style'` for product lines where the sheet marked
 *     every pack size "Varient" (otherwise the whole line is invisible to customers).
 *
 * Usage: node scripts/fix-catalog-visibility.js [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');
const { promoteStyleForVariantOnlyGroups } = require('../src/customer-backend/services/import/ensureStyleClassification');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Orphan hierarchy codes (as they appear on products) → target level-2 subcategory.
 * Target identified by (parent L1 slug, L2 name) to avoid ambiguity.
 */
const CODE_MAPPINGS = [
  // Millet flours → Millets Mandi > Millet Flours
  { codes: ['A 3501', 'A 3502', 'A 3505', 'A 3506', 'A 3507'], parentSlug: 'millets-mandi', subName: 'Millet Flours' },
  // Other flours (rajma, bean, pumpkin, banana, rice varieties) → Groceries & Kitchen > ATTA & Flour
  {
    codes: ['A 3508', 'A 3509', 'A 3510', 'A 3511', 'A 3513', 'A 3515', 'A 3517', 'A 3518'],
    parentSlug: 'groceries-kitchen',
    subName: 'ATTA & Flour',
  },
  // Millet noodles & pasta → Millets Mandi > Millet Noodles & pasta
  {
    codes: ['A 3618', 'A 3619', 'A 3620', 'A 3621', 'A 3728', 'A 3729', 'A 3730', 'A 3731'],
    parentSlug: 'millets-mandi',
    subName: 'Millet Noodles & pasta',
  },
  // Pine Nuts (leaf A1017 missing from Categories sheet) → DRY FRUITS & Seeds > Dry Fruits & Nuts
  { codes: ['A1017'], parentSlug: 'dry-fruits-seeds', subName: 'Dry Fruits & Nuts' },
  // Moringa Oil shares code A1422 with Olive Oil → Groceries & Kitchen > Oil & Ghee
  { codes: ['A1422'], parentSlug: 'groceries-kitchen', subName: 'Oil & Ghee' },
];

const compact = (s) => String(s || '').replace(/\s+/g, '');

(async () => {
  await connectDB();
  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- APPLYING FIXES ---');

  let linkedProducts = 0;

  for (const mapping of CODE_MAPPINGS) {
    const parent = await Category.findOne({ slug: mapping.parentSlug, level: 1, isActive: true }).lean();
    if (!parent) {
      console.error(`SKIP: L1 category slug=${mapping.parentSlug} not found`);
      continue;
    }
    const sub = await Category.findOne({ parentId: parent._id, name: mapping.subName, isActive: true }).lean();
    if (!sub) {
      console.error(`SKIP: L2 "${mapping.subName}" under ${mapping.parentSlug} not found`);
      continue;
    }

    // 1a. Attach codes (raw + compact) to the subcategory so hierarchy-based category
    //     queries and future import relinks resolve these products.
    const codesToAdd = [...new Set(mapping.codes.flatMap((c) => [c, compact(c)]))];
    const newCodes = codesToAdd.filter((c) => !(sub.hierarchyCodes || []).includes(c));
    if (newCodes.length > 0 && !DRY_RUN) {
      await Category.updateOne({ _id: sub._id }, { $addToSet: { hierarchyCodes: { $each: newCodes } } });
    }

    // 1b. Link products carrying these codes that are missing taxonomy.
    const codeVariants = [...new Set(mapping.codes.flatMap((c) => [c, compact(c)]))];
    const filter = {
      hierarchyCode: { $in: codeVariants },
      $or: [{ categoryId: null }, { categoryId: { $exists: false } }, { subcategoryId: null }],
    };
    const affected = await Product.find(filter).select('sku name hierarchyCode').lean();
    if (!DRY_RUN && affected.length > 0) {
      await Product.updateMany(filter, { $set: { categoryId: parent._id, subcategoryId: sub._id } });
    }
    linkedProducts += affected.length;
    console.log(
      `${mapping.parentSlug} > ${mapping.subName}: +${newCodes.length} codes, linked ${affected.length} products` +
        (affected.length ? ` (${affected.map((p) => p.sku).join(', ')})` : '')
    );
  }

  // 2. Promote variant-only lines to Style.
  const warnings = [];
  let promoted = 0;
  if (DRY_RUN) {
    console.log('(dry-run: skipping Style promotion write)');
  } else {
    promoted = await promoteStyleForVariantOnlyGroups({ warnings });
    for (const w of warnings) console.log(' ', w.message);
  }

  console.log(`\nDone. Linked ${linkedProducts} products to categories; promoted ${promoted} SKUs to Style.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
