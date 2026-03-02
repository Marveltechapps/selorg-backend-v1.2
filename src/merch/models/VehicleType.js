const mongoose = require('mongoose');
const { Schema } = mongoose;

const VehicleTypeSchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

VehicleTypeSchema.index({ code: 1 }, { unique: true });
VehicleTypeSchema.index({ isActive: 1 });

module.exports = mongoose.models.VehicleType || mongoose.model('VehicleType', VehicleTypeSchema);
