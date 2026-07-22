require('dotenv').config();
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');

(async () => {
  await connectDB();
  const cats = await Category.find({ hierarchyCodes: { $exists: true, $ne: [] } })
    .select('name slug level hierarchyCodes parentId isActive')
    .lean();
  const interesting = cats.filter((c) => c.hierarchyCodes.some((h) => /35|36|37|1422/.test(h)));
  console.log('CATEGORIES WITH 35xx/36xx/37xx/1422 CODES:');
  for (const c of interesting)
    console.log(c.level, JSON.stringify(c.name), JSON.stringify(c.hierarchyCodes), 'active=' + c.isActive);

  const prods = await Product.find({ $or: [{ categoryId: null }, { categoryId: { $exists: false } }] })
    .select('sku name hierarchyCode classification')
    .lean();
  const codes = [...new Set(prods.map((p) => p.hierarchyCode))].sort();
  console.log('DISTINCT hierarchyCodes of products WITHOUT categoryId:', JSON.stringify(codes));

  // Also check what full set of category hierarchyCodes look like (sample formats)
  const allCodes = [...new Set(cats.flatMap((c) => c.hierarchyCodes))].sort();
  console.log('SAMPLE CATEGORY CODES (first 60):', JSON.stringify(allCodes.slice(0, 60)));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
