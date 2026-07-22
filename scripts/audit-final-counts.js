require('dotenv').config();
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');
const { Category } = require('../src/customer-backend/models/Category');
const { Collection } = require('../src/customer-backend/models/Collection');

(async () => {
  await connectDB();
  const visible = { isActive: true, isSaleable: true, classification: 'Style' };
  const [total, styles, variants, noCat, noSub, l1, l2, l3, colls] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments(visible),
    Product.countDocuments({ classification: 'Variant' }),
    Product.countDocuments({ ...visible, $or: [{ categoryId: null }, { categoryId: { $exists: false } }] }),
    Product.countDocuments({ ...visible, $or: [{ subcategoryId: null }, { subcategoryId: { $exists: false } }] }),
    Category.countDocuments({ level: 1, isActive: true }),
    Category.countDocuments({ level: 2, isActive: true }),
    Category.countDocuments({ level: 3, isActive: true }),
    Collection.countDocuments({ isActive: true }),
  ]);
  console.log(JSON.stringify({ total, styles, variants, noCat, noSub, l1, l2, l3, colls }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
