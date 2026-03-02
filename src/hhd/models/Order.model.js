const mongoose = require('mongoose');
const { ORDER_STATUS, ORDER_PRIORITY, ZONE } = require('../utils/constants');

const OrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: [true, 'Please add an order ID'], unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'HHDUser', required: true, index: true },
    zone: { type: String, enum: Object.values(ZONE), required: true },
    priority: {
      type: String,
      enum: Object.values(ORDER_PRIORITY),
      default: ORDER_PRIORITY.HIGH,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },
    itemCount: { type: Number, required: true, min: 1 },
    targetTime: { type: Number, min: 0 },
    pickTime: { type: Number, min: 0 },
    bagId: { type: String },
    rackLocation: { type: String },
    riderName: { type: String },
    riderId: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'hhd_orders' }
);

OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('HHDOrder', OrderSchema);
