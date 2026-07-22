/**
 * After Style promotion, collapse over-promoted pack sizes back to Variant so each
 * product line keeps exactly one Style card (cheapest SKU) with the rest as variants.
 *
 * Usage: node scripts/cleanup-overpromoted-styles.js [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');
const { productBaseName } = require('../src/customer-backend/utils/productVariantsPayload');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  await connectDB();
  const docs = await Product.find({
    isActive: true,
    isSaleable: true,
    hierarchyCode: { $exists: true, $ne: '' },
  })
    .select('_id sku name price classification hierarchyCode')
    .lean();

  const lines = new Map();
  for (const d of docs) {
    const key = `${String(d.hierarchyCode).trim()}::${productBaseName(d.name)}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(d);
  }

  const demoteIds = [];
  for (const [key, group] of lines) {
    const styles = group.filter((d) => d.classification === 'Style');
    if (styles.length <= 1) continue;
    const sorted = [...styles].sort(
      (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) || String(a.sku).localeCompare(String(b.sku))
    );
    const keep = sorted[0];
    for (const extra of sorted.slice(1)) {
      demoteIds.push(extra._id);
      console.log(` demote ${extra.sku} → Variant (keep Style ${keep.sku} for "${key}")`);
    }
  }

  console.log(`Would demote ${demoteIds.length} SKUs`);
  if (!DRY_RUN && demoteIds.length > 0) {
    await Product.updateMany({ _id: { $in: demoteIds } }, { $set: { classification: 'Variant' } });
    console.log('Applied.');
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
