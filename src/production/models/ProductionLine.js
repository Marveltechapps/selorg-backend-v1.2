const mongoose = require('mongoose');

const productionLineSchema = new mongoose.Schema(
  {
    line_id: {
      type: String,
      required: true,
      unique: true,
    },
    factory_id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    currentJob: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ['running', 'changeover', 'maintenance', 'idle'],
      default: 'idle',
    },
    output: {
      type: Number,
      default: 0,
    },
    target: {
      type: Number,
      default: 0,
    },
    efficiency: {
      type: Number,
      default: 0,
    },
    defect_rate: {
      type: Number,
      default: 0,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

productionLineSchema.index({ factory_id: 1 });
productionLineSchema.index({ line_id: 1 });

module.exports = mongoose.models.ProductionLine || mongoose.model('ProductionLine', productionLineSchema);
