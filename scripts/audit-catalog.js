/**
 * End-to-end catalog DB audit. Prints JSON with counts + integrity findings.
 * Usage: node scripts/audit-catalog.js [--json-out <file>]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');
const { Category } = require('../src/customer-backend/models/Category');
const { Collection } = require('../src/customer-backend/models/Collection');

function summarizeProducts(list, fields = ['sku', 'name']) {
  return list.map((p) => {
    const o = {};
    for (const f of fields) o[f] = p[f];
    o._id = String(p._id);
    return o;
  });
}

async function main() {
  await connectDB();

  const report = { db: mongoose.connection.name };

  // ---- Categories ----
  const allCats = await Category.find({}).lean();
  const catById = new Map(allCats.map((c) => [String(c._id), c]));
  report.categories = {
    total: allCats.length,
    byLevel: { 1: 0, 2: 0, 3: 0 },
    active: allCats.filter((c) => c.isActive).length,
    inactive: allCats.filter((c) => !c.isActive).length,
    inactiveList: allCats.filter((c) => !c.isActive).map((c) => ({ _id: String(c._id), name: c.name, level: c.level })),
    orphanSubcategories: [],
  };
  for (const c of allCats) report.categories.byLevel[c.level] = (report.categories.byLevel[c.level] || 0) + 1;
  for (const c of allCats) {
    if (c.parentId && !catById.has(String(c.parentId))) {
      report.categories.orphanSubcategories.push({ _id: String(c._id), name: c.name, level: c.level, parentId: String(c.parentId) });
    }
  }
  // Subcategories whose parent is inactive (would be hidden downstream)
  report.categories.subWithInactiveParent = allCats
    .filter((c) => c.parentId && catById.get(String(c.parentId)) && !catById.get(String(c.parentId)).isActive)
    .map((c) => ({ _id: String(c._id), name: c.name, level: c.level, parent: catById.get(String(c.parentId)).name }));

  // ---- Collections ----
  const allColls = await Collection.find({}).lean();
  report.collections = {
    total: allColls.length,
    active: allColls.filter((c) => c.isActive).length,
    inactive: allColls.filter((c) => !c.isActive).length,
    inactiveList: allColls.filter((c) => !c.isActive).map((c) => ({ _id: String(c._id), name: c.name, slug: c.slug })),
    list: allColls.map((c) => ({
      name: c.name,
      slug: c.slug,
      type: c.type,
      isActive: c.isActive,
      productIdCount: (c.productIds || []).length,
      schedule: c.schedule || null,
    })),
  };

  // ---- Products ----
  const allProds = await Product.find({}).select(
    'sku name classification status isActive isSaleable isPurchasable stockQuantity stock fixedStock price mrp imageUrl thumbnailUrl cardImageUrl images additionalImages categoryId subcategoryId hierarchyCode deletedAt'
  ).lean();

  const p = report.products = { total: allProds.length };
  const styles = allProds.filter((x) => x.classification === 'Style');
  const variants = allProds.filter((x) => x.classification === 'Variant');
  p.byClassification = { Style: styles.length, Variant: variants.length, other: allProds.length - styles.length - variants.length };
  p.active = allProds.filter((x) => x.isActive).length;
  p.inactive = allProds.filter((x) => !x.isActive).length;
  p.saleable = allProds.filter((x) => x.isSaleable).length;
  p.notSaleable = allProds.filter((x) => !x.isSaleable).length;
  p.statusCounts = allProds.reduce((acc, x) => ((acc[x.status] = (acc[x.status] || 0) + 1), acc), {});
  p.deleted = allProds.filter((x) => x.deletedAt).length;

  const hasStock = (x) => (x.stockQuantity || 0) > 0 || (x.stock || 0) > 0;
  p.outOfStock = allProds.filter((x) => !hasStock(x)).length;
  const hasImage = (x) => Boolean(x.imageUrl || x.thumbnailUrl || x.cardImageUrl || (x.images || []).length || (x.additionalImages || []).length);
  const missingImage = allProds.filter((x) => !hasImage(x));
  const missingPrice = allProds.filter((x) => !(x.price > 0));
  const missingSku = allProds.filter((x) => !x.sku);
  const missingCategory = allProds.filter((x) => !x.categoryId || !catById.has(String(x.categoryId)));
  const missingSubcategory = allProds.filter((x) => !x.subcategoryId || !catById.has(String(x.subcategoryId)));

  p.withoutImage = { count: missingImage.length, list: summarizeProducts(missingImage) };
  p.withoutPrice = { count: missingPrice.length, list: summarizeProducts(missingPrice.map((x) => ({ ...x, price: x.price })), ['sku', 'name', 'price']) };
  p.withoutSku = { count: missingSku.length, list: summarizeProducts(missingSku, ['name']) };
  p.withoutCategory = { count: missingCategory.length, list: summarizeProducts(missingCategory, ['sku', 'name', 'hierarchyCode']) };
  p.withoutSubcategory = { count: missingSubcategory.length, list: summarizeProducts(missingSubcategory, ['sku', 'name', 'hierarchyCode']).slice(0, 50) };

  // Products in no collection
  const inCollection = new Set();
  for (const c of allColls) for (const id of c.productIds || []) inCollection.add(String(id));
  const notInCollection = allProds.filter((x) => !inCollection.has(String(x._id)));
  p.withoutCollection = { count: notInCollection.length };

  // ---- Visibility simulation: exact API filter for list endpoints ----
  const visible = allProds.filter((x) => x.isActive && x.isSaleable && x.classification === 'Style');
  p.customerVisibleByApiFilter = visible.length;
  const invisible = allProds.filter((x) => !(x.isActive && x.isSaleable && x.classification === 'Style'));
  p.hiddenFromCustomer = {
    count: invisible.length,
    reasons: invisible.map((x) => ({
      sku: x.sku,
      name: x.name,
      reasons: [
        !x.isActive && 'isActive=false',
        !x.isSaleable && 'isSaleable=false',
        x.classification !== 'Style' && `classification=${x.classification}`,
      ].filter(Boolean),
    })),
  };

  // Visible products whose category is inactive or missing (may not appear on any category page)
  const activeCatIds = new Set(allCats.filter((c) => c.isActive).map((c) => String(c._id)));
  p.visibleButUnreachableViaCategory = {
    count: visible.filter((x) => !x.categoryId || !activeCatIds.has(String(x.categoryId))).length,
    list: summarizeProducts(
      visible.filter((x) => !x.categoryId || !activeCatIds.has(String(x.categoryId))),
      ['sku', 'name', 'hierarchyCode']
    ).slice(0, 100),
  };

  // Per-category product counts (Style + active + saleable), rolled up over category/subcategory/hierarchy
  const catCounts = [];
  for (const c of allCats.filter((c) => c.level === 1)) {
    const subIds = allCats.filter((s) => String(s.parentId) === String(c._id)).map((s) => String(s._id));
    const leafIds = allCats.filter((s) => subIds.includes(String(s.parentId))).map((s) => String(s._id));
    const idSet = new Set([String(c._id), ...subIds, ...leafIds]);
    const hierPrefixes = (c.hierarchyCodes || []).filter(Boolean);
    const count = visible.filter(
      (x) =>
        idSet.has(String(x.categoryId)) ||
        idSet.has(String(x.subcategoryId)) ||
        hierPrefixes.some((h) => (x.hierarchyCode || '').startsWith(h))
    ).length;
    catCounts.push({ name: c.name, slug: c.slug, isActive: c.isActive, subcategories: subIds.length, productCount: count });
  }
  report.categoryProductCounts = catCounts;

  const out = JSON.stringify(report, null, 2);
  const outIdx = process.argv.indexOf('--json-out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) {
    require('fs').writeFileSync(process.argv[outIdx + 1], out);
    console.log('Report written to', process.argv[outIdx + 1]);
  } else {
    console.log(out);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('AUDIT FAILED:', err.message);
  process.exit(1);
});
