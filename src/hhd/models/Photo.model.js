const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, index: true },
    bagId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'HHDUser', required: true },
    photoUrl: { type: String, required: true },
    photoKey: { type: String },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
  },
  { timestamps: true, collection: 'hhd_photos' }
);

PhotoSchema.index({ orderId: 1, bagId: 1 });

module.exports = mongoose.model('HHDPhoto', PhotoSchema);
