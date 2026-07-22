require('dotenv').config();
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');

function parseHierarchyCode(code) {
  const raw = String(code || '').trim();
  const m = /^([A-Za-z])(\d+)$/.exec(raw);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const digitsStr = m[2];
  const width = digitsStr.length;
  const num = Number.parseInt(digitsStr, 10);
  const pad = (n) => String(n).padStart(width, '0');
  return {
    mainCode: `${letter}${pad(Math.floor(num / 1000) * 1000)}`,
    subCode: `${letter}${pad(Math.floor(num / 100) * 100)}`,
  };
}

(async () => {
  await connectDB();

  const codes = ['A 3501', 'A 3506', 'A 3618', 'A 3728', 'A1017', 'A1422'];
  for (const code of codes) {
    const normalized = code.replace(/\s+/g, '');
    const hc = parseHierarchyCode(normalized);
    const exact = await Category.findOne({ hierarchyCodes: code }).select('name level').lean();
    const norm = await Category.findOne({ hierarchyCodes: normalized }).select('name level').lean();
    const sub = hc ? await Category.findOne({ hierarchyCodes: hc.subCode }).select('name level parentId').lean() : null;
    const main = hc ? await Category.findOne({ hierarchyCodes: hc.mainCode }).select('name level').lean() : null;
    console.log(code, '=> exact:', exact?.name || null, '| normalized:', norm?.name || null, '| sub', hc?.subCode, ':', sub ? `${sub.name} (L${sub.level})` : null, '| main', hc?.mainCode, ':', main ? `${main.name} (L${main.level})` : null);
  }

  // Millets Mandi subtree
  const millets = await Category.findOne({ slug: 'millets-mandi' }).lean();
  if (millets) {
    const subs = await Category.find({ parentId: millets._id }).select('name level hierarchyCodes').lean();
    console.log('\nMillets Mandi codes:', JSON.stringify(millets.hierarchyCodes));
    for (const s of subs) {
      const leaves = await Category.find({ parentId: s._id }).select('name hierarchyCodes').lean();
      console.log('  L2:', s.name, JSON.stringify(s.hierarchyCodes), '| leaves:', leaves.map((l) => `${l.name}${JSON.stringify(l.hierarchyCodes)}`).join(', '));
    }
  }

  // All main (L1) category hierarchy codes
  const mains = await Category.find({ level: 1 }).select('name slug hierarchyCodes isActive').lean();
  console.log('\nL1 categories:');
  for (const m of mains) console.log(' ', m.name, JSON.stringify(m.hierarchyCodes), 'active=' + m.isActive);

  // Which subcategory codes exist in the 3000s range under any letter
  const catsWith3xxx = await Category.find({ hierarchyCodes: { $regex: /^[A-Za-z]\s?3\d{3}$/ } })
    .select('name level hierarchyCodes')
    .lean();
  console.log('\nCategories with A3xxx codes:', catsWith3xxx.length);
  for (const c of catsWith3xxx) console.log(' ', c.level, c.name, JSON.stringify(c.hierarchyCodes));

  // Full count of products with space-containing hierarchy codes
  const spaceCodeProds = await Product.countDocuments({ hierarchyCode: { $regex: /\s/ } });
  console.log('\nProducts with whitespace in hierarchyCode:', spaceCodeProds);

  // Products with A1017 / A1422
  const p1 = await Product.find({ hierarchyCode: { $in: ['A1017', 'A1422'] } }).select('sku name classification hierarchyCode categoryId subcategoryId').lean();
  console.log('\nProducts with A1017/A1422:');
  for (const p of p1) console.log(' ', p.sku, p.name, p.hierarchyCode, 'cat=' + p.categoryId, 'sub=' + p.subcategoryId, p.classification);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
