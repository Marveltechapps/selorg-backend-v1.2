const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Order = require('./darkstore/models/Order');
const Staff = require('./darkstore/models/Staff');
const StockAlert = require('./darkstore/models/StockAlert');
const RTOAlert = require('./darkstore/models/RTOAlert');

const Store = require('./merch/models/Store');

const STORES = [
  { id: 'DS-Brooklyn-04', label: 'Brooklyn', lat: 40.6862, lng: -73.9777, radius: 5 },
  { id: 'DS-Manhattan-10', label: 'Manhattan', lat: 40.7649, lng: -73.9672, radius: 3 },
  { id: 'DS-Queens-02', label: 'Queens', lat: 40.7282, lng: -73.8625, radius: 6 },
];

const CUSTOMER_NAMES = [
  'Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Gupta', 'Vikram Singh',
  'Ananya Das', 'Arjun Reddy', 'Meera Nair', 'Karan Malhotra', 'Divya Joshi',
  'Rohan Verma', 'Pooja Mehta', 'Saurabh Yadav', 'Neha Agarwal', 'Deepak Pandey',
  'Aisha Khan', 'Rajesh Iyer', 'Kavya Rao', 'Manish Dubey', 'Swati Mishra',
];

const STAFF_NAMES = {
  'DS-Brooklyn-04': {
    Picker: ['Alex Rivera', 'Jordan Chen', 'Sam Williams', 'Casey Jones'],
    Packer: ['Morgan Lee', 'Riley Johnson', 'Dakota Kim'],
    Loader: ['Quinn Adams'],
    Rider: ['Blake Thompson', 'Avery Martinez'],
    Supervisor: ['Taylor Brooks'],
  },
  'DS-Manhattan-10': {
    Picker: ['Emma Watson', 'Liam Park', 'Olivia Brown'],
    Packer: ['Noah Davis', 'Sophia Miller', 'James Wilson'],
    Loader: ['Isabella Garcia', 'Mason Rodriguez'],
    Rider: ['Ava Lopez', 'Ethan Hill'],
    Supervisor: ['Mia Thomas'],
  },
  'DS-Queens-02': {
    Picker: ['Harper Scott', 'Elijah Green', 'Amelia Baker', 'Benjamin Adams', 'Charlotte Nelson'],
    Packer: ['Lucas Hall', 'Ella Young'],
    Loader: ['Henry King'],
    Rider: ['Grace Wright', 'Daniel Torres', 'Chloe Phillips'],
    Supervisor: ['Jack Robinson'],
  },
};

const STOCK_ITEMS = [
  { name: 'Organic Bananas', sku: 'BAN001' },
  { name: 'Whole Milk 1L', sku: 'MLK001' },
  { name: 'Brown Eggs (12)', sku: 'EGG001' },
  { name: 'Sourdough Bread', sku: 'BRD001' },
  { name: 'Greek Yogurt 500g', sku: 'YGT001' },
  { name: 'Chicken Breast 1kg', sku: 'CHK001' },
  { name: 'Basmati Rice 5kg', sku: 'RIC001' },
  { name: 'Olive Oil 500ml', sku: 'OIL001' },
  { name: 'Fresh Tomatoes 1kg', sku: 'TOM001' },
  { name: 'Almond Butter 250g', sku: 'ALM001' },
  { name: 'Orange Juice 1L', sku: 'OJC001' },
  { name: 'Avocados (3 pack)', sku: 'AVO001' },
];

const ORDER_CONFIGS = {
  'DS-Brooklyn-04': { newOrders: 8, processing: 5, ready: 3, baseId: 1000 },
  'DS-Manhattan-10': { newOrders: 12, processing: 7, ready: 4, baseId: 2000 },
  'DS-Queens-02':    { newOrders: 5, processing: 3, ready: 2, baseId: 3000 },
};

const STOCK_ALERT_CONFIGS = {
  'DS-Brooklyn-04': [
    { idx: 0, current: 3, threshold: 20, severity: 'critical' },
    { idx: 1, current: 8, threshold: 15, severity: 'warning' },
    { idx: 2, current: 12, threshold: 25, severity: 'low' },
  ],
  'DS-Manhattan-10': [
    { idx: 3, current: 1, threshold: 10, severity: 'critical' },
    { idx: 4, current: 5, threshold: 30, severity: 'critical' },
    { idx: 5, current: 15, threshold: 20, severity: 'warning' },
    { idx: 6, current: 22, threshold: 40, severity: 'warning' },
    { idx: 7, current: 18, threshold: 25, severity: 'low' },
  ],
  'DS-Queens-02': [
    { idx: 8, current: 2, threshold: 15, severity: 'critical' },
    { idx: 9, current: 10, threshold: 20, severity: 'warning' },
  ],
};

const RTO_CONFIGS = {
  'DS-Brooklyn-04': [
    { issueType: 'customer_unreachable', severity: 'high', desc: 'Customer not answering phone after 3 attempts' },
    { issueType: 'address_issue', severity: 'medium', desc: 'Incomplete delivery address, building not found' },
  ],
  'DS-Manhattan-10': [
    { issueType: 'delivery_failed', severity: 'critical', desc: 'Building security denied entry to rider' },
    { issueType: 'customer_unreachable', severity: 'high', desc: 'Wrong phone number provided' },
    { issueType: 'payment_failed', severity: 'medium', desc: 'COD payment not available, customer wants to cancel' },
    { issueType: 'address_issue', severity: 'low', desc: 'Floor number missing from address' },
  ],
  'DS-Queens-02': [
    { issueType: 'delivery_failed', severity: 'high', desc: 'Package damaged during transit, customer rejected' },
  ],
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateOrders(storeId) {
  const config = ORDER_CONFIGS[storeId];
  const orders = [];
  let ordNum = config.baseId;

  const makeOrder = (status, slaStatus) => {
    ordNum++;
    const now = new Date();
    const createdMinutesAgo = Math.floor(Math.random() * 30) + 1;
    const createdAt = new Date(now.getTime() - createdMinutesAgo * 60000);
    const deadline = new Date(createdAt.getTime() + 15 * 60000);
    const types = ['Normal', 'Priority', 'Express', 'Premium'];
    const typeWeights = [0.5, 0.25, 0.15, 0.1];
    const r = Math.random();
    let cumulative = 0;
    let orderType = 'Normal';
    for (let i = 0; i < types.length; i++) {
      cumulative += typeWeights[i];
      if (r <= cumulative) { orderType = types[i]; break; }
    }
    const minutesLeft = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 60000));
    const secondsLeft = Math.max(0, Math.floor(((deadline.getTime() - now.getTime()) % 60000) / 1000));
    return {
      order_id: `ORD-${ordNum}`,
      id: `#ORD-${ordNum}`,
      store_id: storeId,
      order_type: orderType,
      status,
      item_count: Math.floor(Math.random() * 8) + 1,
      sla_timer: `${String(minutesLeft).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`,
      sla_status: slaStatus,
      sla_deadline: deadline,
      customer_name: randomFrom(CUSTOMER_NAMES),
      customer_phone: `+91${Math.floor(7000000000 + Math.random() * 3000000000)}`,
      rto_risk: Math.random() < 0.15,
      createdAt: createdAt,
      updatedAt: now,
    };
  };

  for (let i = 0; i < config.newOrders; i++) {
    const sla = i < 2 ? 'critical' : i < 4 ? 'warning' : 'safe';
    orders.push(makeOrder('new', sla));
  }
  for (let i = 0; i < config.processing; i++) {
    const sla = i < 1 ? 'warning' : 'safe';
    orders.push(makeOrder('processing', sla));
  }
  for (let i = 0; i < config.ready; i++) {
    orders.push(makeOrder('ready', 'safe'));
  }
  return orders;
}

function generateStaff(storeId) {
  const names = STAFF_NAMES[storeId];
  const staff = [];
  let idx = storeId === 'DS-Brooklyn-04' ? 100 : storeId === 'DS-Manhattan-10' ? 200 : 300;

  for (const [role, roleNames] of Object.entries(names)) {
    for (const name of roleNames) {
      idx++;
      const isActive = Math.random() < 0.75;
      const statuses = isActive ? ['Active', 'Active', 'Active', 'Break'] : ['Offline', 'Meeting'];
      const zones = ['Zone 1 (Ambient)', 'Zone 2 (Chilled)', 'Zone 3 (Frozen)', 'Zone 4 (Fresh)'];
      const now = new Date();
      const shiftStart = new Date(now);
      shiftStart.setHours(6, 0, 0, 0);
      const shiftEnd = new Date(now);
      shiftEnd.setHours(14, 0, 0, 0);
      staff.push({
        staff_id: `STF-${idx}`,
        store_id: storeId,
        name,
        role,
        zone: randomFrom(zones),
        status: randomFrom(statuses),
        current_shift: '6:00 AM - 2:00 PM',
        shift_start: shiftStart,
        shift_end: shiftEnd,
        is_active: isActive,
        current_load: isActive ? Math.floor(Math.random() * 80) + 10 : 0,
      });
    }
  }
  return staff;
}

function generateStockAlerts(storeId) {
  const configs = STOCK_ALERT_CONFIGS[storeId];
  return configs.map(c => ({
    store_id: storeId,
    item_name: STOCK_ITEMS[c.idx].name,
    sku: STOCK_ITEMS[c.idx].sku,
    current_count: c.current,
    threshold: c.threshold,
    severity: c.severity,
    is_restocked: false,
  }));
}

function generateRTOAlerts(storeId) {
  const configs = RTO_CONFIGS[storeId];
  const orderConfig = ORDER_CONFIGS[storeId];
  return configs.map((c, i) => ({
    order_id: `ORD-${orderConfig.baseId + i + 1}`,
    store_id: storeId,
    issue_type: c.issueType,
    description: c.desc,
    severity: c.severity,
    customer_reachable: c.issueType !== 'customer_unreachable',
    is_resolved: false,
  }));
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const storeIds = STORES.map(s => s.id);

  console.log('\n--- Ensuring Store documents have coordinates ---');
  for (const s of STORES) {
    await Store.updateOne(
      { code: s.id },
      { $set: { latitude: s.lat, longitude: s.lng, deliveryRadius: s.radius, type: 'dark_store', status: 'active' } },
      { upsert: false }
    );
    console.log(`  ${s.id}: lat=${s.lat}, lng=${s.lng}, radius=${s.radius}km`);
  }

  console.log('\n--- Cleaning existing darkstore data for target stores ---');
  await Order.deleteMany({ store_id: { $in: storeIds } });
  await Staff.deleteMany({ store_id: { $in: storeIds } });
  await StockAlert.deleteMany({ store_id: { $in: storeIds } });
  await RTOAlert.deleteMany({ store_id: { $in: storeIds } });
  console.log('Cleaned existing data.');

  for (const store of STORES) {
    console.log(`\n=== Seeding ${store.label} (${store.id}) ===`);

    const orders = generateOrders(store.id);
    await Order.insertMany(orders);
    console.log(`  Orders: ${orders.length} (new: ${orders.filter(o=>o.status==='new').length}, processing: ${orders.filter(o=>o.status==='processing').length}, ready: ${orders.filter(o=>o.status==='ready').length})`);

    const staff = generateStaff(store.id);
    await Staff.insertMany(staff);
    const activeStaff = staff.filter(s => s.is_active);
    console.log(`  Staff: ${staff.length} total (${activeStaff.length} active) - Pickers: ${staff.filter(s=>s.role==='Picker').length}, Packers: ${staff.filter(s=>s.role==='Packer').length}`);

    const stockAlerts = generateStockAlerts(store.id);
    await StockAlert.insertMany(stockAlerts);
    console.log(`  Stock Alerts: ${stockAlerts.length} (critical: ${stockAlerts.filter(a=>a.severity==='critical').length}, warning: ${stockAlerts.filter(a=>a.severity==='warning').length})`);

    const rtoAlerts = generateRTOAlerts(store.id);
    await RTOAlert.insertMany(rtoAlerts);
    console.log(`  RTO Alerts: ${rtoAlerts.length}`);
  }

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

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
