/**
 * Verify DB ↔ API ↔ webapp taxonomy consistency after repair.
 * For every active L1 category and each of its subcategories:
 *   - fetch the live customer API product list,
 *   - cross-check each returned product's STORED taxonomy in the DB,
 *   - flag any product whose stored subcategory differs from the page it
 *     appears on (leaks caused by loose query ORs still deployed).
 *
 * Usage: node scripts/verify-taxonomy-api.js [--api https://api.selorg.com/api/v1/customer]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');

const apiIdx = process.argv.indexOf('--api');
const API = apiIdx !== -1 && process.argv[apiIdx + 1]
  ? process.argv[apiIdx + 1]
  : 'https://api.selorg.com/api/v1/customer';

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

(async () => {
  await connectDB();
  const cats = await Category.find({}).lean();
  const byId = new Map(cats.map((c) => [String(c._id), c]));

  const l1s = cats
    .filter((c) => c.level === 1 && c.isActive)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let totalLeaks = 0;
  for (const l1 of l1s) {
    const subsRes = await getJson(`${API}/categories/${l1.slug}/subcategories`);
    const subs = subsRes.data || [];
    console.log(`\n### ${l1.name} (${l1.slug}) — ${subs.length} subcategories`);
    for (const sub of subs) {
      let page = 1;
      const ids = [];
      let total = 0;
      for (;;) {
        const res = await getJson(
          `${API}/categories/${l1.slug}/products?subcategory=${encodeURIComponent(sub.slug)}&limit=50&page=${page}`
        );
        const prods = res.data?.products || [];
        total = res.data?.pagination?.total ?? prods.length;
        for (const p of prods) ids.push(p.id);
        if (prods.length < 50 || page >= (res.data?.pagination?.totalPages || 1)) break;
        page += 1;
      }
      // Strict DB count for this subcategory.
      const dbCount = await Product.countDocuments({
        classification: 'Style',
        isActive: true,
        isSaleable: true,
        subcategoryId: new mongoose.Types.ObjectId(sub._id),
      });
      // Cross-check stored taxonomy of every API-returned product.
      const stored = await Product.find({ _id: { $in: ids.map((i) => new mongoose.Types.ObjectId(i)) } })
        .select('_id sku name subcategoryId categoryId hierarchyCode')
        .lean();
      const leaks = stored.filter(
        (p) => p.subcategoryId && String(p.subcategoryId) !== String(sub._id)
      );
      totalLeaks += leaks.length;
      const mark = leaks.length > 0 ? '  <-- LEAKS' : '';
      console.log(`  ${sub.name}: api=${total} dbStrict=${dbCount}${mark}`);
      for (const p of leaks) {
        const s = p.subcategoryId ? byId.get(String(p.subcategoryId)) : null;
        console.log(`     LEAK: ${p.sku} "${p.name}" stored-in="${s ? s.name : 'null'}" hc=${p.hierarchyCode}`);
      }
    }
  }
  console.log(`\nTOTAL cross-subcategory leaks via live API: ${totalLeaks}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
