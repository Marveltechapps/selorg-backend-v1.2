const mongoose = require('mongoose');
const { Schema } = mongoose;

const AllocationSchema = new Schema({
  skuId: { type: Schema.Types.ObjectId, ref: 'SKU', required: true },
  locationId: { type: String, required: true },
  locationName: { type: String, required: true },
  allocated: { type: Number, default: 0 },
  target: { type: Number, default: 0 },
  onHand: { type: Number, default: 0 },
  inTransit: { type: Number, default: 0 },
  safetyStock: { type: Number, default: 0 },
  history: [{
    week: { type: String },
    demand: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    recordedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true
});

AllocationSchema.index({ skuId: 1, locationId: 1 }, { unique: true });

module.exports = mongoose.models.Allocation || mongoose.model('Allocation', AllocationSchema);
