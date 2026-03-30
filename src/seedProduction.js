/**
 * Seed script for Production Dashboard: QC, Maintenance, Workforce
 * Run: node src/seedProduction.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const QCInspection = require('./production/models/QCInspection');
const SampleTest = require('./production/models/SampleTest');
const ProductionEquipment = require('./production/models/ProductionEquipment');
const MaintenanceTask = require('./production/models/MaintenanceTask');
const ProductionIotDevice = require('./production/models/ProductionIotDevice');
const Staff = require('./production/models/Staff');
const Attendance = require('./production/models/Attendance');
const ShiftCoverage = require('./production/models/ShiftCoverage');
const Factory = require('./production/models/Factory');
const ProductionLine = require('./production/models/ProductionLine');
const RawMaterial = require('./production/models/RawMaterial');
const InboundReceipt = require('./production/models/InboundReceipt');
const Requisition = require('./production/models/Requisition');
const WorkOrder = require('./production/models/WorkOrder');
const ProductionPlan = require('./production/models/ProductionPlan');
const ProductionAlert = require('./production/models/ProductionAlert');
const ProductionIncident = require('./production/models/ProductionIncident');
const ProductionSyncHistory = require('./production/models/ProductionSyncHistory');
const ProductionSettings = require('./production/models/ProductionSettings');
const BulkUpload = require('./production/models/BulkUpload');
const AuditLog = require('./production/models/AuditLog');

// Hub tenant key used across the Production dashboard.
const STORE_ID = process.env.DASHBOARD_HUB_KEY || process.env.DEFAULT_STORE_ID || 'chennai-hub';
const FACTORY_ID = process.env.DASHBOARD_HUB_KEY || process.env.DEFAULT_FACTORY_ID || 'chennai-hub';

const seed = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-test';
    await mongoose.connect(uri);
    console.log('MongoDB Connected for production seed');

    const today = new Date().toISOString().split('T')[0];

    // ---- Hub scope: Chennai only ----
    // Factories / Lines (Production Overview + factory selector)
    const factoryCount = await Factory.countDocuments({ factory_id: FACTORY_ID });
    if (factoryCount === 0) {
      await Factory.insertMany([
        { factory_id: FACTORY_ID, name: 'Chennai Production Hub', code: 'FAC-CHN-01', status: 'operational' },
      ]);
      console.log('✅ Seeded Factory');
    } else {
      console.log('Factory already exists, skipping');
    }

    const lineCount = await ProductionLine.countDocuments({ factory_id: FACTORY_ID });
    if (lineCount === 0) {
      await ProductionLine.insertMany([
        {
          line_id: 'CHN-L1',
          factory_id: FACTORY_ID,
          name: 'Line A (Assembly)',
          currentJob: 'Job #1042 - Organic Oats',
          status: 'running',
          output: 1200,
          target: 1400,
          efficiency: 86,
          defect_rate: 0.02,
        },
        {
          line_id: 'CHN-L2',
          factory_id: FACTORY_ID,
          name: 'Line B (Packaging)',
          currentJob: 'Job #1043 - Granola',
          status: 'changeover',
          output: 620,
          target: 900,
          efficiency: 78,
          defect_rate: 0.03,
        },
        {
          line_id: 'CHN-L3',
          factory_id: FACTORY_ID,
          name: 'Line C (Bottling)',
          status: 'maintenance',
          currentJob: null,
          output: 0,
          target: 0,
          efficiency: 0,
          defect_rate: 0.0,
        },
        {
          line_id: 'CHN-L4',
          factory_id: FACTORY_ID,
          name: 'Line D (Processing)',
          status: 'idle',
          currentJob: null,
          output: 0,
          target: 0,
          efficiency: 0,
          defect_rate: 0.0,
        },
      ]);
      console.log('✅ Seeded Production lines');
    } else {
      console.log('Production lines already exist, skipping');
    }

    // Raw materials (Raw Material Mgmt)
    const materialsCount = await RawMaterial.countDocuments({ store_id: STORE_ID });
    if (materialsCount === 0) {
      await RawMaterial.insertMany([
        { name: 'Organic Oats', currentStock: 950, unit: 'kg', safetyStock: 1200, reorderPoint: 1000, supplier: 'GreenFields', category: 'Grains', store_id: STORE_ID, orderStatus: 'none' },
        { name: 'Sugar', currentStock: 420, unit: 'kg', safetyStock: 600, reorderPoint: 500, supplier: 'SweetCo', category: 'Sweeteners', store_id: STORE_ID, orderStatus: 'none' },
        { name: 'Packaging Film', currentStock: 210, unit: 'rolls', safetyStock: 300, reorderPoint: 260, supplier: 'PackPro', category: 'Packaging', store_id: STORE_ID, orderStatus: 'none' },
        { name: 'Protein Powder', currentStock: 155, unit: 'kg', safetyStock: 250, reorderPoint: 200, supplier: 'NutriLabs', category: 'Supplements', store_id: STORE_ID, orderStatus: 'none' },
      ]);
      console.log('✅ Seeded raw materials');
    }

    // Receipts + Requisitions
    const receiptsCount = await InboundReceipt.countDocuments({ store_id: STORE_ID });
    if (receiptsCount === 0) {
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 2);
      await InboundReceipt.insertMany([
        { poNumber: 'PO-CHN-9001', supplier: 'GreenFields', expectedDate: expectedDate, status: 'pending', items: 'Organic Oats', store_id: STORE_ID },
        { poNumber: 'PO-CHN-9002', supplier: 'PackPro', expectedDate: expectedDate, status: 'pending', items: 'Packaging Film', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded inbound receipts');
    }

    const reqCount = await Requisition.countDocuments({ store_id: STORE_ID });
    if (reqCount === 0) {
      await Requisition.insertMany([
        { reqNumber: 'REQ-CHN-5011', material: 'Organic Oats', quantity: 500, requestedBy: 'Planning Team', line: 'CHN-L1', status: 'pending', store_id: STORE_ID },
        { reqNumber: 'REQ-CHN-5012', material: 'Packaging Film', quantity: 120, requestedBy: 'Packaging Team', line: 'CHN-L2', status: 'approved', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded requisitions');
    }

    // Work Orders + Plans
    const workOrdersCount = await WorkOrder.countDocuments({ store_id: STORE_ID });
    if (workOrdersCount === 0) {
      await WorkOrder.insertMany([
        { orderNumber: 'WO-CHN-3001', product: 'Organic Oats', quantity: 1800, line: 'CHN-L1', operator: '', priority: 'high', status: 'pending', dueDate: new Date(today), store_id: STORE_ID },
        { orderNumber: 'WO-CHN-3002', product: 'Granola', quantity: 900, line: 'CHN-L2', operator: 'John', priority: 'medium', status: 'in-progress', dueDate: new Date(today), store_id: STORE_ID },
        { orderNumber: 'WO-CHN-3003', product: 'Protein Powder', quantity: 650, line: 'CHN-L1', operator: 'Emma', priority: 'low', status: 'completed', dueDate: new Date(today), store_id: STORE_ID },
      ]);
      console.log('✅ Seeded work orders');
    }

    const plansCount = await ProductionPlan.countDocuments({ store_id: STORE_ID });
    if (plansCount === 0) {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 5);
      await ProductionPlan.insertMany([
        { product: 'Organic Oats', line: 'CHN-L1', startDate: start, endDate: end, quantity: 5000, status: 'scheduled', store_id: STORE_ID },
        { product: 'Granola', line: 'CHN-L2', startDate: start, endDate: end, quantity: 2500, status: 'scheduled', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded production plans');
    }

    // Dashboard alerts/incidents/settings/sync history
    const alertCount = await ProductionAlert.countDocuments({ factory_id: FACTORY_ID });
    if (alertCount === 0) {
      await ProductionAlert.insertMany([
        { alert_id: 'ALT-CHN-1', title: 'Conveyor Belt A1 slowdown', description: 'Output drop detected on Line A.', severity: 'warning', category: 'equipment', status: 'active', location: 'Line A', assigned_to: 'Maintenance', resolved_by: '', resolved_at: null, factory_id: FACTORY_ID },
        { alert_id: 'ALT-CHN-2', title: 'Packaging film shortage risk', description: 'Stock approaching reorder point.', severity: 'critical', category: 'material', status: 'active', location: 'Warehouse', assigned_to: 'Planning', resolved_by: '', resolved_at: null, factory_id: FACTORY_ID },
      ]);
      console.log('✅ Seeded production alerts');
    }

    const incidentCount = await ProductionIncident.countDocuments({ factory_id: FACTORY_ID });
    if (incidentCount === 0) {
      await ProductionIncident.insertMany([
        { incident_id: 'INC-CHN-1', title: 'Temperature out of range', description: 'Cooling system drift observed.', severity: 'high', category: 'quality', reported_by: 'QC Team', location: 'Line C', status: 'open', factory_id: FACTORY_ID, reported_at: new Date(), resolved_at: null, resolved_by: '' },
      ]);
      console.log('✅ Seeded production incident');
    }

    const settingsCount = await ProductionSettings.countDocuments({ factory_id: FACTORY_ID });
    if (settingsCount === 0) {
      await ProductionSettings.insertMany([
        { factory_id: FACTORY_ID, auto_sync: true, sync_interval_minutes: 15, auto_backup: true, backup_interval: 'daily', email_notifications: true, alert_threshold: 'medium' },
      ]);
      console.log('✅ Seeded production settings');
    }

    const syncCount = await ProductionSyncHistory.countDocuments({ factory_id: FACTORY_ID });
    if (syncCount === 0) {
      await ProductionSyncHistory.insertMany([
        { sync_id: 'HSDSYNC-CHN-1', factory_id: FACTORY_ID, device_count: 45, status: 'success', duration_seconds: 12.3, created_at: new Date() },
      ]);
      console.log('✅ Seeded production sync history');
    }

    const uploadCount = await BulkUpload.countDocuments({ store_id: STORE_ID });
    if (uploadCount === 0) {
      const now = new Date().toISOString();
      await BulkUpload.insertMany([
        { upload_id: 'UPL-CHN-1', store_id: STORE_ID, file_name: 'work-orders-chn.csv', total_rows: 42, processed_rows: 40, failed_rows: 2, errorLogs: [], status: 'completed', validate_only: false, upload_type: 'work-orders', uploaded_by: 'System', created_at: now, completed_at: now },
      ]);
      console.log('✅ Seeded bulk upload history');
    }

    const auditCount = await AuditLog.countDocuments({ store_id: STORE_ID });
    if (auditCount === 0) {
      await AuditLog.insertMany([
        { id: 'AUD-CHN-1', timestamp: new Date().toISOString(), action_type: 'create', user: 'System', user_id: 'system', user_name: 'System', module: 'settings', action: 'SEED_PRODUCTION', details: { factoryId: FACTORY_ID }, store_id: STORE_ID, ip_address: '127.0.0.1' },
      ]);
      console.log('✅ Seeded audit logs');
    }

    // QC Inspections
    const inspectionCount = await QCInspection.countDocuments({ store_id: STORE_ID });
    if (inspectionCount === 0) {
      await QCInspection.insertMany([
        { inspection_id: 'INS-10001', batch_id: 'Batch #9921', product_name: 'Weight Check', inspector: 'Sarah J.', date: today, status: 'passed', score: 100, items_inspected: 1, defects_found: 0, notes: 'Within acceptable range', store_id: STORE_ID },
        { inspection_id: 'INS-10002', batch_id: 'Batch #9921', product_name: 'Visual Inspection', inspector: 'Sarah J.', date: today, status: 'failed', score: 0, items_inspected: 1, defects_found: 1, notes: 'Color deviation detected', store_id: STORE_ID },
        { inspection_id: 'INS-10003', batch_id: 'Batch #9920', product_name: 'Temperature Check', inspector: 'Mike D.', date: today, status: 'passed', score: 100, items_inspected: 1, defects_found: 0, store_id: STORE_ID },
      ]);
      console.log('✅ Seeded QC inspections');
    } else {
      console.log('QC inspections already exist, skipping');
    }

    // Lab Tests (SampleTest)
    const sampleCount = await SampleTest.countDocuments({ store_id: STORE_ID });
    if (sampleCount === 0) {
      await SampleTest.insertMany([
        { sample_id: 'LAB-23-882', batch_id: 'Tank B', product_name: 'Raw Milk Tank B', test_type: 'Microbiology (Bacteria)', status: 'in-progress', priority: 'high', result: 'pending', tested_by: 'Lab', date: today, received_date: today, store_id: STORE_ID },
        { sample_id: 'LAB-23-885', batch_id: 'Batch #9920', product_name: 'Finished Granola', test_type: 'Moisture Content', status: 'completed', priority: 'normal', result: 'pass', result_notes: '3.2% - Within Spec', tested_by: 'Lab', date: today, received_date: today, completed_date: today, store_id: STORE_ID },
        { sample_id: 'LAB-23-880', batch_id: 'Supplier Lot #441', product_name: 'Protein Powder', test_type: 'Heavy Metals', status: 'pending', priority: 'high', result: 'pending', tested_by: 'Lab', date: today, received_date: today, store_id: STORE_ID },
      ]);
      console.log('✅ Seeded lab tests');
    } else {
      console.log('Lab tests already exist, skipping');
    }

    // Equipment
    const equipCount = await ProductionEquipment.countDocuments({ store_id: STORE_ID });
    if (equipCount === 0) {
      await ProductionEquipment.insertMany([
        { equipment_id: 'EQ-001', name: 'Conveyor Belt A1', code: 'CVB-A1', status: 'operational', health: 98, location: 'Line A', category: 'Conveyor', last_maintenance: '2024-12-15', next_maintenance: '2025-01-15', store_id: STORE_ID },
        { equipment_id: 'EQ-002', name: 'Mixer M-200', code: 'MXR-200', status: 'maintenance', health: 75, location: 'Processing Area', category: 'Mixer', last_maintenance: '2024-11-20', next_maintenance: today, store_id: STORE_ID },
        { equipment_id: 'EQ-003', name: 'Packaging Machine PM-3', code: 'PKG-PM3', status: 'operational', health: 92, location: 'Line B', category: 'Packaging', last_maintenance: '2024-12-10', next_maintenance: '2025-01-10', store_id: STORE_ID },
        { equipment_id: 'EQ-004', name: 'Cooling System CS-A', code: 'CLS-CSA', status: 'down', health: 45, location: 'Line A', category: 'Cooling', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded equipment');
    } else {
      console.log('Equipment already exists, skipping');
    }

    // Maintenance Tasks
    const taskCount = await MaintenanceTask.countDocuments({ store_id: STORE_ID });
    if (taskCount === 0) {
      await MaintenanceTask.insertMany([
        { task_id: 'MNT-001', equipment_id: 'EQ-002', equipment_name: 'Mixer M-200', task_type: 'preventive', priority: 'high', status: 'scheduled', scheduled_date: today, description: 'Lubrication and belt replacement', estimated_hours: 4, store_id: STORE_ID },
        { task_id: 'MNT-002', equipment_id: 'EQ-004', equipment_name: 'Cooling System CS-A', task_type: 'breakdown', priority: 'critical', status: 'in-progress', scheduled_date: today, description: 'Compressor failure - urgent repair', technician: 'John Smith', estimated_hours: 8, store_id: STORE_ID },
      ]);
      console.log('✅ Seeded maintenance tasks');
    } else {
      console.log('Maintenance tasks already exist, skipping');
    }

    // IoT Devices
    const iotCount = await ProductionIotDevice.countDocuments({ store_id: STORE_ID });
    if (iotCount === 0) {
      await ProductionIotDevice.insertMany([
        { device_id: 'HSD-A1-001', name: 'Line A Temperature Monitor', device_type: 'HSD', status: 'online', battery: 85, last_reading: '2 min ago', location: 'Line A', store_id: STORE_ID },
        { device_id: 'HSD-B2-002', name: 'Line B Vibration Sensor', device_type: 'HSD', status: 'online', battery: 92, last_reading: '1 min ago', location: 'Line B', store_id: STORE_ID },
        { device_id: 'SNR-M200-01', name: 'Mixer Speed Sensor', device_type: 'Sensor', status: 'online', battery: 15, last_reading: '3 min ago', location: 'Processing Area', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded IoT devices');
    } else {
      console.log('IoT devices already exist, skipping');
    }

    // Staff
    const staffCount = await Staff.countDocuments({ store_id: STORE_ID });
    if (staffCount === 0) {
      await Staff.insertMany([
        { staff_id: 'EMP-001', name: 'Michael Chen', role: 'Lead Operator', department: 'operators', zone: 'Line A', status: 'Active', current_shift: 'morning', store_id: STORE_ID },
        { staff_id: 'EMP-002', name: 'Sarah Johnson', role: 'Junior Operator', department: 'operators', zone: 'Line A', status: 'Active', current_shift: 'morning', store_id: STORE_ID },
        { staff_id: 'EMP-003', name: 'David Rodriguez', role: 'Senior Operator', department: 'operators', zone: 'Line B', status: 'Break', current_shift: 'morning', store_id: STORE_ID },
        { staff_id: 'EMP-004', name: 'Emma Wilson', role: 'Operator', department: 'operators', zone: 'Line C', status: 'Offline', current_shift: 'morning', store_id: STORE_ID },
        { staff_id: 'EMP-011', name: 'James Martinez', role: 'QC Inspector', department: 'qc', status: 'Active', current_shift: 'morning', store_id: STORE_ID },
        { staff_id: 'EMP-012', name: 'Lisa Anderson', role: 'QC Lead', department: 'qc', status: 'Active', current_shift: 'morning', store_id: STORE_ID },
        { staff_id: 'EMP-021', name: 'Robert Taylor', role: 'Production Supervisor', department: 'supervisors', zone: 'Line A-B', status: 'Active', current_shift: 'morning', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded staff');
    } else {
      console.log('Staff already exists, skipping');
    }

    // Shift Coverage
    const shiftDate = new Date(today);
    const coverageCount = await ShiftCoverage.countDocuments({
      store_id: STORE_ID,
      date: { $gte: shiftDate, $lt: new Date(today + 'T23:59:59.999Z') },
    });
    if (coverageCount === 0) {
      await ShiftCoverage.insertMany([
        { shift: 'morning', shift_label: '6:00 AM - 2:00 PM', current_staff: 5, target_staff: 26, status: 'understaffed', date: shiftDate, store_id: STORE_ID },
        { shift: 'afternoon', shift_label: '2:00 PM - 10:00 PM', current_staff: 18, target_staff: 20, status: 'staffed', date: shiftDate, store_id: STORE_ID },
        { shift: 'night', shift_label: '10:00 PM - 6:00 AM', current_staff: 12, target_staff: 15, status: 'staffed', date: shiftDate, store_id: STORE_ID },
      ]);
      console.log('✅ Seeded shift coverage');
    } else {
      console.log('Shift coverage already exists, skipping');
    }

    // Attendance
    const attCount = await Attendance.countDocuments({ store_id: STORE_ID, date: today });
    if (attCount === 0) {
      await Attendance.insertMany([
        { record_id: 'ATT-001', staff_id: 'EMP-001', date: today, status: 'present', check_in: '05:55 AM', check_out: '02:05 PM', hours_worked: 8.2, store_id: STORE_ID },
        { record_id: 'ATT-002', staff_id: 'EMP-002', date: today, status: 'present', check_in: '06:10 AM', store_id: STORE_ID },
        { record_id: 'ATT-003', staff_id: 'EMP-003', date: today, status: 'late', check_in: '06:20 AM', store_id: STORE_ID },
        { record_id: 'ATT-004', staff_id: 'EMP-004', date: today, status: 'absent', store_id: STORE_ID },
        { record_id: 'ATT-005', staff_id: 'EMP-011', date: today, status: 'present', check_in: '05:58 AM', store_id: STORE_ID },
      ]);
      console.log('✅ Seeded attendance');
    } else {
      console.log('Attendance already exists, skipping');
    }

    console.log('\nProduction seed completed.');
    process.exit(0);
  } catch (err) {
    console.error('Production seed failed:', err.message);
    process.exit(1);
  }
};

// Run only when executed directly (prevents accidental DB seeding on import)
if (require.main === module) {
  seed();
}

module.exports = seed;
