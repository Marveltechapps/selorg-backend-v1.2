const mongoose = require('mongoose');

const PickerOtRequestSchema = new mongoose.Schema(
  {
    pickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
    requestedOtMinutes: { type: Number, required: true, min: 0 },
    shiftEndTime: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    decisionReason: { type: String, default: '' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'picker_ot_requests' }
);

PickerOtRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.PickerOtRequest || mongoose.model('PickerOtRequest', PickerOtRequestSchema);

