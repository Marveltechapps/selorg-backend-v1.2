/**
 * Seed picker SLA config with default values.
 * Run: node src/seedPickerSlaConfig.js
 */
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PickerSlaConfig = require('./picker/models/slaConfig.model');

const DEFAULT_CONFIG = {
  pickingSLA_minutes: 15,
  idleAlert_minutes: 10,
  lateTolerance_minutes: 5,
  overtimeGrace_minutes: 15,
};

const seed = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';
    await mongoose.connect(uri);
    console.log('MongoDB connected for picker SLA seed');

    const existed = (await PickerSlaConfig.countDocuments()) > 0;
    const result = await PickerSlaConfig.findOneAndUpdate(
      {},
      { $setOnInsert: DEFAULT_CONFIG },
      { upsert: true, new: true }
    );

    if (!existed && result) {
      console.log('Created picker_sla_config with defaults:', DEFAULT_CONFIG);
    } else {
      console.log('picker_sla_config already exists, no changes');
    }
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
