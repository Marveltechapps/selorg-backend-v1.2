const mongoose = require('mongoose');

const rawMaterialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    currentStock: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, required: true, default: 'kg' },
    safetyStock: { type: Number, required: true, min: 0, default: 0 },
    reorderPoint: { type: Number, required: true, min: 0, default: 0 },
    supplier: { type: String, default: '' },
    category: { type: String, default: '' },
    lastOrderDate: { type: Date },
    orderStatus: { type: String, enum: ['none', 'ordered'], default: 'none' },
  },
  { timestamps: true }
);

rawMaterialSchema.index({ name: 'text', category: 'text' });
rawMaterialSchema.index({ currentStock: 1 });

module.exports = mongoose.models.RawMaterial || mongoose.model('RawMaterial', rawMaterialSchema, 'prod_raw_materials');
