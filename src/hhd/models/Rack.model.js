const mongoose = require('mongoose');

const RackSchema = new mongoose.Schema(
  {
    rackCode: { type: String, required: true, unique: true, index: true },
    rackIdentifier: { type: String, required: true, index: true },
    slotNumber: { type: Number, required: true },
    location: { type: String, required: true },
    zone: { type: String, required: true, index: true },
    isAvailable: { type: Boolean, default: true, index: true },
    currentOrderId: { type: String },
    riderName: { type: String },
    riderId: { type: String },
    assignedAt: { type: Date },
  },
  { timestamps: true, collection: 'hhd_racks' }
);

RackSchema.index({ zone: 1, isAvailable: 1 });
RackSchema.index({ rackIdentifier: 1, slotNumber: 1 }, { unique: true });

module.exports = mongoose.model('HHDRack', RackSchema);
