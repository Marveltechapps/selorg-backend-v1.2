const mongoose = require('mongoose');
const { ORDER_STATUS, ZONE } = require('../utils/constants');

const CompletedOrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: [true, 'Please add an order ID'], unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'HHDUser', required: true, index: true },
    zone: { type: String, enum: Object.values(ZONE), required: true },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.COMPLETED,
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
    rackAssignedAt: { type: Date },
  },
  { timestamps: true, collection: 'hhd_completed_orders' }
);

CompletedOrderSchema.index({ userId: 1, status: 1 });
CompletedOrderSchema.index({ status: 1, createdAt: -1 });
CompletedOrderSchema.index({ orderId: 1 });

module.exports = mongoose.model('HHDCompletedOrder', CompletedOrderSchema);
