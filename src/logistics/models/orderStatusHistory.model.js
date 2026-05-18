'use strict';

const mongoose = require('mongoose');

const SOURCES = ['INTERNAL', 'WEBHOOK', 'MANUAL'];

const orderStatusHistorySchema = new mongoose.Schema(
  {
    logisticsOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LogisticsOrder',
      required: true,
      index: true,
    },
    status: { type: String, required: true },
    message: { type: String },
    location: {
      lat: Number,
      lng: Number,
    },
    eventTime: { type: Date, default: Date.now },
    source: { type: String, enum: SOURCES, default: 'INTERNAL' },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.OrderStatusHistory ||
  mongoose.model('OrderStatusHistory', orderStatusHistorySchema);
module.exports.SOURCES = SOURCES;
