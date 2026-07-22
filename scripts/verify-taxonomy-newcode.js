/**
 * Verify the TIGHTENED query builders (this repo's categoriesService) against
 * the repaired DB: for every active L1 + L2, run the exact filter the API will
 * use after deployment and assert no product leaks across subcategories.
 *
 * Usage: node scripts/verify-taxonomy-newcode.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');
const {
  collectHierarchyCodesForSubcategory,
  collectHierarchyCodesForMainCategory,
  productTaxonomyOrForSubcategory,
  productTaxonomyOrForMainCategory,
} = require('../src/customer-backend/services/categoriesService');

(async () => {
  await connectDB();
  const cats = await Category.find({}).lean();
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  const l1s = cats
    .filter((c) => c.level === 1 && c.isActive)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const base = { classification: 'Style', isActive: true, isSaleable: true };
  let totalLeaks = 0;
  let grandTotal = 0;

  for (const l1 of l1s) {
    const subs = cats
      .filter((c) => c.level === 2 && c.isActive && String(c.parentId) === String(l1._id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const mainCodes = await collectHierarchyCodesForMainCategory(l1._id, subs);
    const mainCount = await Product.countDocuments({
      ...base,
      $or: productTaxonomyOrForMainCategory(l1._id, subs, mainCodes),
    });
    grandTotal += mainCount;
    console.log(`\n### ${l1.name}: category page total=${mainCount}`);

    for (const sub of subs) {
      const codes = await collectHierarchyCodesForSubcategory(sub._id);
      const filter = { ...base, $or: productTaxonomyOrForSubcategory(sub._id, codes) };
      const rows = await Product.find(filter).select('sku name subcategoryId hierarchyCode').lean();
      const leaks = rows.filter(
        (p) => p.subcategoryId && String(p.subcategoryId) !== String(sub._id)
      );
      totalLeaks += leaks.length;
      console.log(`  ${sub.name}: ${rows.length}${leaks.length ? '  <-- LEAKS' : ''}`);
      for (const p of leaks) {
        const s = byId.get(String(p.subcategoryId));
        console.log(`     LEAK: ${p.sku} "${p.name}" stored-in="${s ? s.name : '?'}" hc=${p.hierarchyCode}`);
      }
    }
  }

  console.log(`\nTOTAL leaks with NEW query code: ${totalLeaks}`);
  await mongoose.disconnect();
  process.exit(totalLeaks === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
