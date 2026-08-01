/**
 * Darkstore maintenance script.
 * Demo/seed order insertion is permanently disabled — real orders only.
 * This script only ensures store coordinates and can clean leftover demo collections.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Order = require('./darkstore/models/Order');
const Staff = require('./darkstore/models/Staff');
const StockAlert = require('./darkstore/models/StockAlert');
const RTOAlert = require('./darkstore/models/RTOAlert');
const Store = require('./merch/models/Store');

/** Only Adyar darkstore */
const STORES = [
  { id: 'DS-Adyar-01', label: 'Adyar', lat: 13.0067, lng: 80.2573, radius: 10 },
];

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const storeIds = STORES.map((s) => s.id);

  console.log('\n--- Ensuring Store documents have coordinates ---');
  for (const s of STORES) {
    await Store.updateOne(
      { code: s.id },
      {
        $set: {
          latitude: s.lat,
          longitude: s.lng,
          deliveryRadius: s.radius,
          type: 'dark_store',
          status: 'active',
        },
      },
      { upsert: false }
    );
    console.log(`  ${s.id}: lat=${s.lat}, lng=${s.lng}, radius=${s.radius}km`);
  }

  console.log('\n--- Cleaning existing darkstore demo data for target stores ---');
  await Order.deleteMany({ store_id: { $in: storeIds } });
  await Staff.deleteMany({ store_id: { $in: storeIds } });
  await StockAlert.deleteMany({ store_id: { $in: storeIds } });
  await RTOAlert.deleteMany({ store_id: { $in: storeIds } });
  console.log(
    'Cleaned existing data. Demo seeding for orders/staff/alerts remains disabled (real data only).'
  );

  console.log('\n--- Verification ---');
  for (const store of STORES) {
    const oc = await Order.countDocuments({ store_id: store.id });
    const sc = await Staff.countDocuments({ store_id: store.id });
    const sac = await StockAlert.countDocuments({ store_id: store.id });
    const rc = await RTOAlert.countDocuments({ store_id: store.id });
    console.log(`${store.id}: ${oc} orders, ${sc} staff, ${sac} stock alerts, ${rc} RTO alerts`);
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
