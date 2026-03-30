const mongoose = require('mongoose');

const WarehouseReportSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
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

WarehouseReportSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.WarehouseReport || mongoose.model('WarehouseReport', WarehouseReportSchema);

