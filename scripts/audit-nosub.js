require('dotenv').config();
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');
const { Category } = require('../src/customer-backend/models/Category');

(async () => {
  await connectDB();
  const list = await Product.find({
    isActive: true,
    isSaleable: true,
    classification: 'Style',
    $or: [{ subcategoryId: null }, { subcategoryId: { $exists: false } }],
  })
    .select('sku name categoryId')
    .lean();
  for (const p of list) {
    const c = p.categoryId ? await Category.findById(p.categoryId).select('name').lean() : null;
    console.log(p.sku, '|', p.name, '| cat=', c?.name || 'NONE');
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
