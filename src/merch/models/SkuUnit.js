const mongoose = require('mongoose');
const { Schema } = mongoose;

const SkuUnitSchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  baseUnit: { type: String },
  conversionFactor: { type: Number },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

SkuUnitSchema.index({ code: 1 }, { unique: true });
SkuUnitSchema.index({ isActive: 1 });

module.exports = mongoose.models.SkuUnit || mongoose.model('SkuUnit', SkuUnitSchema);
