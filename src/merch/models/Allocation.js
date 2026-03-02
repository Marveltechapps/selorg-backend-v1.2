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
  safetyStock: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.models.Allocation || mongoose.model('Allocation', AllocationSchema);
