/**
 * One-shot: deactivate PROD-* seed SKUs and consolidate duplicate L2 categories.
 * Run from selorg-backend-v1.2: node scripts/consolidate-catalog-taxonomy.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const {
  deactivateLegacySeedProducts,
  consolidateDuplicateSubcategories,
} = require('../src/customer-backend/utils/categoryTaxonomyCleanup');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const warnings = [];
  const seedDeactivated = await deactivateLegacySeedProducts();
  const consolidated = await consolidateDuplicateSubcategories({ warnings });
  console.log(
    JSON.stringify(
      {
        seedDeactivated,
        consolidated,
        warningSample: warnings.slice(0, 20),
        warningCount: warnings.length,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
