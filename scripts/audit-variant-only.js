/** Find product groups (by hierarchyCode) that are active+saleable but have NO Style doc, plus PROD-* status. */
require('dotenv').config();
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');

(async () => {
  await connectDB();

  const groups = await Product.aggregate([
    { $match: { isActive: true, isSaleable: true, hierarchyCode: { $ne: '' } } },
    {
      $group: {
        _id: '$hierarchyCode',
        total: { $sum: 1 },
        styles: { $sum: { $cond: [{ $eq: ['$classification', 'Style'] }, 1, 0] } },
        names: { $push: '$name' },
        skus: { $push: '$sku' },
      },
    },
    { $match: { styles: 0 } },
  ]);
  console.log('VARIANT-ONLY GROUPS (no Style):', groups.length);
  for (const g of groups) console.log(' ', g._id, '|', g.total, 'docs |', g.skus.join(','), '|', g.names[0]);

  const seeds = await Product.find({ sku: { $regex: /^PROD-/ } })
    .select('sku name classification isActive isSaleable status categoryId subcategoryId')
    .lean();
  console.log('\nPROD-* seed products:', seeds.length);
  for (const s of seeds)
    console.log(' ', s.sku, s.name, '|', s.classification, '| active=' + s.isActive, 'saleable=' + s.isSaleable, 'cat=' + s.categoryId, 'sub=' + s.subcategoryId);

  // Kavuni rice SKUs not in current sheet
  const kavuni = await Product.find({ sku: { $in: ['S3358', 'S3359', 'S3360', 'S3130', 'S3131', 'S3132'] } })
    .select('sku name classification isActive isSaleable categoryId subcategoryId hierarchyCode')
    .lean();
  console.log('\nKavuni rice (in DB, not in sheet):');
  for (const s of kavuni) console.log(' ', s.sku, s.name, '|', s.classification, '| cat=' + s.categoryId, 'sub=' + s.subcategoryId, 'hc=' + s.hierarchyCode);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
