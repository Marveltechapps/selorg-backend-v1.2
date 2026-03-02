const mongoose = require('mongoose');
const { ITEM_STATUS } = require('../utils/constants');

const ItemSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, index: true },
    itemCode: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    category: { type: String, enum: ['Fresh', 'Snacks', 'Grocery', 'Care'], index: true },
    status: {
      type: String,
      enum: Object.values(ITEM_STATUS),
      default: ITEM_STATUS.PENDING,
      index: true,
    },
    substituteItemCode: { type: String, default: null },
    scannedAt: { type: Date },
    location: { type: String },
    notes: { type: String },
  },
  { timestamps: true, collection: 'hhd_items' }
);

ItemSchema.index({ orderId: 1, status: 1 });
ItemSchema.index({ itemCode: 1 });

module.exports = mongoose.model('HHDItem', ItemSchema);
