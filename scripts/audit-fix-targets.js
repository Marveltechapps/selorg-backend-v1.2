/** Verify fix targets: S13387 state, target L2 categories, dry-fruits sub for A1017, olive oil taxonomy. */
require('dotenv').config();
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');

(async () => {
  await connectDB();

  const s = await Product.findOne({ sku: 'S13387' }).select('sku name classification isActive isSaleable categoryId subcategoryId hierarchyCode imageUrl images additionalImages').lean();
  console.log('S13387:', JSON.stringify(s, null, 2));

  for (const name of ['Millet Flours', 'Millet Noodles & pasta', 'ATTA & Flour']) {
    const c = await Category.findOne({ name, isActive: true }).select('name level parentId hierarchyCodes').lean();
    const parent = c?.parentId ? await Category.findById(c.parentId).select('name level').lean() : null;
    console.log(`L2 "${name}":`, c ? `${c._id} level=${c.level} parent=${parent?.name} codes=${JSON.stringify(c.hierarchyCodes)}` : 'NOT FOUND');
  }

  // Pine nuts: find leaf A1016/A1018 parents
  for (const code of ['A1016', 'A1018']) {
    const leaf = await Category.findOne({ hierarchyCodes: code }).select('name level parentId').lean();
    const parent = leaf?.parentId ? await Category.findById(leaf.parentId).select('name level parentId').lean() : null;
    const grand = parent?.parentId ? await Category.findById(parent.parentId).select('name').lean() : null;
    console.log(`leaf ${code}:`, leaf?.name, '| parent:', parent?.name, parent?._id, '| grandparent:', grand?.name);
  }

  // Olive oil taxonomy
  const olive = await Product.findOne({ sku: 'S7461' }).select('categoryId subcategoryId').lean();
  const oc = olive?.categoryId ? await Category.findById(olive.categoryId).select('name').lean() : null;
  const os = olive?.subcategoryId ? await Category.findById(olive.subcategoryId).select('name').lean() : null;
  console.log('Olive S7461: cat=', olive?.categoryId, oc?.name, '| sub=', olive?.subcategoryId, os?.name);

  // Confirm variant-only groups WITH taxonomy already set (so only classification promotion needed)
  const skus = ['S898', 'S8635', 'S9626', 'S7281', 'S7397', 'S7413', 'S7429', 'S7445', 'S7461'];
  for (const sku of skus) {
    const p = await Product.findOne({ sku }).select('sku name categoryId subcategoryId price').lean();
    console.log(p.sku, p.name, 'cat=' + p.categoryId, 'sub=' + p.subcategoryId, 'price=' + p.price);
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
