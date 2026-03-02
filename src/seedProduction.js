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

const STORE_ID = process.env.DEFAULT_STORE_ID || 'PROD-001';

const seed = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-test';
    await mongoose.connect(uri);
    console.log('MongoDB Connected for production seed');

    const today = new Date().toISOString().split('T')[0];

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

seed();
