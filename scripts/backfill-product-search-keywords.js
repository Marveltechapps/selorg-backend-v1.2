/**
 * Backfill multilingual search keywords for all existing products.
 *
 * Usage:
 *   node scripts/backfill-product-search-keywords.js
 *   node scripts/backfill-product-search-keywords.js --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../src/customer-backend/models/Product');
const { Category } = require('../src/customer-backend/models/Category');
const { applySearchKeywordsToDoc } = require('../src/customer-backend/services/search/productSearchKeywords');

const BATCH_SIZE = 200;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI or MONGO_URI required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const categoryCache = new Map();
  async function getCategoryName(id) {
    if (!id) return '';
    const key = String(id);
    if (categoryCache.has(key)) return categoryCache.get(key);
    const cat = await Category.findById(id).select('name').lean();
    const name = cat?.name || '';
    categoryCache.set(key, name);
    return name;
  }

  const total = await Product.countDocuments({});
  console.log(`Processing ${total} products${dryRun ? ' (dry run)' : ''}...`);

  let processed = 0;
  let updated = 0;

  const cursor = Product.find({}).cursor();
  let batch = [];

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      const count = await processBatch(batch, getCategoryName);
      updated += count;
      processed += batch.length;
      console.log(`Progress: ${processed}/${total} (${updated} updated)`);
      batch = [];
    }
  }
  if (batch.length > 0) {
    const count = await processBatch(batch, getCategoryName);
    updated += count;
    processed += batch.length;
  }

  console.log(`Done. Processed ${processed}, updated ${updated}${dryRun ? ' (dry run — no writes)' : ''}.`);

  // Ensure text index is rebuilt with new fields
  if (!dryRun) {
    try {
      await Product.collection.dropIndex('product_text_search');
      console.log('Dropped old text index');
    } catch (_) {
      /* index may not exist or have different name */
    }
    await Product.syncIndexes();
    console.log('Synced indexes');
  }

  await mongoose.disconnect();
}

async function processBatch(docs, getCategoryName) {
  let count = 0;
  const ops = [];

  for (const doc of docs) {
    const categoryName = await getCategoryName(doc.categoryId);
    const subcategoryName = await getCategoryName(doc.subcategoryId);
    const before = doc.searchKeywordsNormalized || '';
    applySearchKeywordsToDoc(doc, { categoryName, subcategoryName });
    const after = doc.searchKeywordsNormalized || '';
    if (before !== after || !Array.isArray(doc.searchKeywords) || doc.searchKeywords.length === 0) {
      count++;
      if (!dryRun) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                searchKeywords: doc.searchKeywords,
                searchKeywordsNormalized: doc.searchKeywordsNormalized,
              },
            },
          },
        });
      }
    }
  }

  if (!dryRun && ops.length > 0) {
    await Product.bulkWrite(ops, { ordered: false });
  }

  return count;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
