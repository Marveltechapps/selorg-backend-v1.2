const mongoose = require('mongoose');
const { BAG_STATUS } = require('../utils/constants');

const BagSchema = new mongoose.Schema(
  {
    bagId: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'HHDUser', required: true },
    status: {
      type: String,
      enum: Object.values(BAG_STATUS),
      default: BAG_STATUS.SCANNED,
      index: true,
    },
    size: { type: String, index: true },
    scannedAt: { type: Date, default: Date.now },
    photoUrl: { type: String },
  },
  { timestamps: true, collection: 'hhd_bags' }
);

BagSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('HHDBag', BagSchema);
