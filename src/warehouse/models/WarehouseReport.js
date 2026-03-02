const mongoose = require('mongoose');

const WarehouseReportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  date: { type: Date, required: true },
  metrics: {
    inboundQueue: { type: Number, default: 0 },
    outboundQueue: { type: Number, default: 0 },
    inventoryHealth: { type: Number, default: 100 },
    criticalAlerts: { type: Number, default: 0 }
  },
  capacityUtilization: {
    storageBins: { type: Number, default: 0 },
    palletZones: { type: Number, default: 0 },
    coldStorage: { type: Number, default: 0 }
  }
}, { timestamps: true, collection: 'warehouse_daily_reports' });

module.exports = mongoose.models.WarehouseReport || mongoose.model('WarehouseReport', WarehouseReportSchema);

