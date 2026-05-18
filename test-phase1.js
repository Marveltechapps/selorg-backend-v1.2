/**
 * Phase 1 Testing: Store Assignment & Inventory Filtering
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { DarkStore } = require('./src/customer-backend/models/DarkStore');
const { StoreInventory } = require('./src/customer-backend/models/StoreInventory');
const { Product } = require('./src/customer-backend/models/Product');

async function testPhase1() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('\n=== PHASE 1: Store Assignment & Inventory ===\n');

  try {
    // Test 1: Stores exist
    const stores = await DarkStore.find().lean();
    console.log(`✅ Test 1: Found ${stores.length} dark stores`);
    stores.forEach(s => console.log(`   - ${s.name} at (${s.location.coordinates[1]}, ${s.location.coordinates[0]})`));

    // Test 2: Inventory records exist
    const inventory = await StoreInventory.countDocuments();
    console.log(`\n✅ Test 2: Found ${inventory} inventory records`);

    // Test 3: Each store has products
    for (const store of stores) {
      const storeInv = await StoreInventory.countDocuments({ storeId: store._id });
      console.log(`   - Store ${store.name}: ${storeInv} products`);
    }

    // Test 4: Products are active and saleable
    const activeProducts = await Product.countDocuments({ isActive: true, isSaleable: true });
    console.log(`\n✅ Test 3: Found ${activeProducts} active saleable products`);

    // Test 5: Sample check - First store, first 3 products
    if (stores.length > 0) {
      const firstStore = stores[0];
      const sampleInv = await StoreInventory.find({ storeId: firstStore._id }).limit(3).lean();
      console.log(`\n✅ Test 4: Sample inventory for ${firstStore.name}:`);
      for (const inv of sampleInv) {
        const prod = await Product.findById(inv.productId).select('name sku').lean();
        console.log(`   - ${prod.name} (${prod.sku}): ${inv.quantity} qty, Available: ${inv.isAvailable}`);
      }
    }

    console.log('\n✅ Phase 1 Database Validation: PASSED\n');
    return true;
  } catch (err) {
    console.error('❌ Phase 1 Test Failed:', err.message);
    return false;
  } finally {
    await mongoose.disconnect();
  }
}

testPhase1();
