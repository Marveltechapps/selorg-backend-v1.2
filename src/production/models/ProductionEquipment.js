const mongoose = require('mongoose');

const productionEquipmentSchema = new mongoose.Schema(
  {
    equipment_id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['operational', 'maintenance', 'down', 'idle'],
      default: 'operational',
    },
    health: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
      max: 100,
    },
    location: { type: String },
    category: { type: String },
    last_maintenance: { type: String },
    next_maintenance: { type: String },
    store_id: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

productionEquipmentSchema.index({ store_id: 1, status: 1 });
productionEquipmentSchema.index({ equipment_id: 1 });

module.exports = mongoose.models.ProductionEquipment || mongoose.model('ProductionEquipment', productionEquipmentSchema);
