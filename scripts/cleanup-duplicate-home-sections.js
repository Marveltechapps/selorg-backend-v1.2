/**
 * One-time / manual cleanup for duplicate home page sections left by older importers.
 *
 * Usage: node scripts/cleanup-duplicate-home-sections.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { HomeSectionDefinition } = require('../src/customer-backend/models/HomeSectionDefinition');
const { HomeSection } = require('../src/customer-backend/models/HomeSection');
const { Collection } = require('../src/customer-backend/models/Collection');
const { cleanupDuplicateHomeSectionArtifacts } = require('../src/customer-backend/services/import/homePageContentImport.service');
const { dedupeHomeSectionDefinitions } = require('../src/customer-backend/utils/dedupeHomeSectionDefinitions');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is required');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const allDefs = await HomeSectionDefinition.find({}).sort({ order: 1 }).lean();
  const canonicalDocs = dedupeHomeSectionDefinitions(allDefs).map((d) => ({
    key: d.key,
    label: d.label,
    order: d.order,
    type: d.type,
    collectionId: d.collectionId,
  }));

  console.log(`Canonical sections after dedupe: ${canonicalDocs.length} (was ${allDefs.length})`);

  const cleanup = await cleanupDuplicateHomeSectionArtifacts(canonicalDocs, null);
  console.log('Cleanup result:', cleanup);

  const dealDefs = await HomeSectionDefinition.find({
    $or: [{ key: /deal_in_lowest/i }, { label: /deal in lowest price/i }],
  }).lean();
  console.log('Deal sections remaining:', dealDefs.map((d) => ({ key: d.key, label: d.label, order: d.order })));

  const legacy = await HomeSection.find({ title: /deal in lowest price/i }).lean();
  console.log('Legacy HomeSection rows:', legacy.map((s) => ({ sectionKey: s.sectionKey, title: s.title })));

  const suffixCollections = await Collection.find({ slug: /deal-in-lowest-price-\d+$/ }).lean();
  console.log(
    'Suffix collections:',
    suffixCollections.map((c) => ({ slug: c.slug, isActive: c.isActive }))
  );

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
