'use strict';

const mongoose = require('mongoose');

const STATUSES = [
  'CREATED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
];

const providerOrderSchema = new mongoose.Schema(
  {
    logisticsOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LogisticsOrder',
      required: true,
      index: true,
    },
    provider: { type: String, required: true, index: true },
    providerOrderId: { type: String, index: true },
    rawRequest: { type: mongoose.Schema.Types.Mixed },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: STATUSES },
  },
  { timestamps: true }
);

providerOrderSchema.index({ provider: 1, providerOrderId: 1 }, { sparse: true });

module.exports =
  mongoose.models.ProviderOrder || mongoose.model('ProviderOrder', providerOrderSchema);
