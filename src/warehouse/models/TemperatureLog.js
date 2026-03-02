const mongoose = require('mongoose');

const TemperatureLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  zone: { type: String, required: true },
  temperature: { type: Number, required: true },
  humidity: { type: Number, required: true },
  status: { type: String, enum: ['normal', 'warning', 'critical'], default: 'normal' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'warehouse_temperature_logs' });

module.exports = mongoose.models.TemperatureLog || mongoose.model('TemperatureLog', TemperatureLogSchema);

