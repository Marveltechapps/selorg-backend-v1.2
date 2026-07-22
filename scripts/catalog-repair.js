/**
 * Catalog repair (from 2026-07-21 catalog audit).
 *
 * 1. Disable legacy seed/demo products PROD-001..PROD-010
 *    (isActive=false, isSaleable=false, status=inactive; store_inventory rows unavailable).
 * 2. Relink Red Kavuni Rice SKUs from duplicate subcategory
 *    "Red Rice & Brown Rice" (red-rice-brown-rice-2) to the live
 *    "Red RICE & Brown RICE" (red-rice-brown-rice-3).
 * 3. Deactivate duplicate/empty active Rice subcategories left over from re-imports:
 *    - basmathi-seeraga-samba (0 products; live twin: basmathi-seeraga-samba-rice)
 *    - red-rice-brown-rice-2  (empty after step 2; live twin: red-rice-brown-rice-3)
 * 4. Repair Red/Sigappu Kavuni Rice prices (currently ₹1/₹1) using the
 *    same-family catalog pricing (Black Kavunni Rice + Red kavuni flour agree:
 *    1kg 339/379, 2kg 679/759, 5kg 1679/1879). Flagged for manual review.
 *
 * Usage:
 *   node scripts/catalog-repair.js          (dry run — prints planned changes)
 *   node scripts/catalog-repair.js --apply  (writes changes)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const SEED_SKUS = [
  'PROD-001', 'PROD-002', 'PROD-003', 'PROD-004', 'PROD-005',
  'PROD-006', 'PROD-007', 'PROD-008', 'PROD-009', 'PROD-010',
];

const DUP_SUB_RED_2 = '6a5b77363bc9e96166f0010d'; // red-rice-brown-rice-2 (dup, active)
const LIVE_SUB_RED_3 = '6a5deab6ecfe7c8081fe834c'; // red-rice-brown-rice-3 (live)
const DUP_SUB_BASMATHI = '69d8bfc39d463d9aaa3f6dde'; // basmathi-seeraga-samba (dup, active, empty)

// Family pricing evidence: Black Kavunni Rice S3250-52 and Red kavuni flour
// S13193-95 both price kavuni products at 339/379 per kg with linear packs.
const KAVUNI_PRICES = {
  S3130: { price: 339, mrp: 379 },   // Red Kavuni 1kg
  S3131: { price: 679, mrp: 759 },   // Red Kavuni 2kg
  S3132: { price: 1679, mrp: 1879 }, // Red Kavuni 5kg
  S3358: { price: 339, mrp: 379 },   // Sigappu Kavuni 1kg
  S3359: { price: 679, mrp: 759 },   // Sigappu Kavuni 2kg
  S3360: { price: 1679, mrp: 1879 }, // Sigappu Kavuni 5kg
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('customer_products');
  const categories = db.collection('customer_categories');
  const storeInventory = db.collection('store_inventory');

  console.log(`Connected to ${db.databaseName} — mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  // ---------- 1. Seed stubs ----------
  const stubs = await products
    .find({ sku: { $in: SEED_SKUS } })
    .project({ sku: 1, name: 1, isActive: 1, isSaleable: 1, status: 1 })
    .toArray();
  console.log(`1) Seed stubs to disable: ${stubs.length}`);
  stubs.forEach((s) => console.log(`   ${s.sku} | ${s.name} | isActive=${s.isActive} isSaleable=${s.isSaleable}`));
  if (APPLY && stubs.length) {
    const res = await products.updateMany(
      { sku: { $in: SEED_SKUS } },
      { $set: { isActive: false, isSaleable: false, status: 'inactive' } }
    );
    console.log(`   -> products updated: ${res.modifiedCount}`);
    const invRes = await storeInventory.updateMany(
      { productId: { $in: stubs.map((s) => s._id) } },
      { $set: { isAvailable: false, quantity: 0 } }
    );
    console.log(`   -> store_inventory rows disabled: ${invRes.modifiedCount}`);
  }

  // ---------- 2. Relink Red Kavuni to live subcategory ----------
  const dupOid = new mongoose.Types.ObjectId(DUP_SUB_RED_2);
  const liveOid = new mongoose.Types.ObjectId(LIVE_SUB_RED_3);
  const [dupSub, liveSub] = await Promise.all([
    categories.findOne({ _id: dupOid }, { projection: { name: 1, slug: 1, isActive: 1 } }),
    categories.findOne({ _id: liveOid }, { projection: { name: 1, slug: 1, isActive: 1 } }),
  ]);
  const toRelink = await products
    .find({ subcategoryId: dupOid })
    .project({ sku: 1, name: 1 })
    .toArray();
  console.log(`\n2) Relink ${toRelink.length} products: "${dupSub?.slug}" -> "${liveSub?.slug}" (live active=${liveSub?.isActive})`);
  toRelink.forEach((p) => console.log(`   ${p.sku} | ${p.name}`));
  if (APPLY && toRelink.length && liveSub?.isActive) {
    const res = await products.updateMany(
      { subcategoryId: dupOid },
      { $set: { subcategoryId: liveOid } }
    );
    console.log(`   -> relinked: ${res.modifiedCount}`);
  }

  // ---------- 3. Deactivate duplicate empty subs ----------
  const dupsToDeactivate = [];
  for (const id of [DUP_SUB_RED_2, DUP_SUB_BASMATHI]) {
    const oid = new mongoose.Types.ObjectId(id);
    const cat = await categories.findOne({ _id: oid }, { projection: { name: 1, slug: 1, isActive: 1 } });
    if (!cat) continue;
    // Count products AFTER the relink above (in dry run, count minus planned relinks)
    let productCount = await products.countDocuments({ subcategoryId: oid });
    if (!APPLY && id === DUP_SUB_RED_2) productCount -= toRelink.length;
    if (cat.isActive && productCount <= 0) {
      dupsToDeactivate.push({ oid, cat });
    } else {
      console.log(`   skip ${cat.slug}: isActive=${cat.isActive} products=${productCount}`);
    }
  }
  console.log(`\n3) Duplicate subcategories to deactivate: ${dupsToDeactivate.length}`);
  dupsToDeactivate.forEach((d) => console.log(`   ${d.cat.slug} (${d.cat.name})`));
  if (APPLY && dupsToDeactivate.length) {
    const res = await categories.updateMany(
      { _id: { $in: dupsToDeactivate.map((d) => d.oid) } },
      { $set: { isActive: false } }
    );
    console.log(`   -> deactivated: ${res.modifiedCount}`);
  }

  // ---------- 4. Kavuni prices ----------
  const kavuniSkus = Object.keys(KAVUNI_PRICES);
  const kavuni = await products
    .find({ sku: { $in: kavuniSkus } })
    .project({ sku: 1, name: 1, price: 1, mrp: 1 })
    .toArray();
  console.log(`\n4) Kavuni price repairs:`);
  for (const k of kavuni) {
    const target = KAVUNI_PRICES[k.sku];
    const wrong = Number(k.price) <= 1 || Number(k.mrp) <= 1;
    console.log(`   ${k.sku} | ${k.name} | ${k.price}/${k.mrp} -> ${wrong ? `${target.price}/${target.mrp}` : 'OK, skip'}`);
    if (APPLY && wrong) {
      await products.updateOne(
        { _id: k._id },
        {
          $set: {
            price: target.price,
            mrp: target.mrp,
            originalPrice: target.mrp,
            pricingMeta: {
              source: 'family_price_repair_black_kavunni_S3250',
              updatedAt: new Date().toISOString(),
            },
            'pricingReview.status': 'Needs Manual Review',
            'pricingReview.reason': 'price_was_1_repaired_from_same_family',
            'pricingReview.suggestedSalePrice': target.price,
            'pricingReview.suggestedMrp': target.mrp,
            'pricingReview.published': false,
            'pricingReview.suggestedAt': new Date().toISOString(),
          },
        }
      );
    }
  }
  if (APPLY) console.log('   -> price updates applied');

  console.log(`\nDone (${APPLY ? 'APPLIED' : 'dry run only'}).`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
