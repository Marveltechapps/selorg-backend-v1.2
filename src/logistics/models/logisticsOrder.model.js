'use strict';

const mongoose = require('mongoose');

const ORDER_TYPES = ['VENDOR_TO_WAREHOUSE', 'WAREHOUSE_TO_DARKSTORE'];
const PROVIDERS = ['PORTER', 'SHADOWFAX', 'LOADSHARE'];
const STATUSES = [
  'CREATED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
];

const locationSub = {
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
};

const itemSub = {
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  weight: { type: Number, default: 0 },
};

const driverInfoSub = {
  name: String,
  phone: String,
  vehicleNumber: String,
  vehicleType: String,
};

const logisticsOrderSchema = new mongoose.Schema(
  {
    referenceId: { type: String, required: true, index: true },
    type: { type: String, enum: ORDER_TYPES, required: true, index: true },
    provider: { type: String, enum: PROVIDERS, required: true, index: true },
    providerOrderId: { type: String, index: true, sparse: true },
    status: {
      type: String,
      enum: STATUSES,
      default: 'CREATED',
      index: true,
    },
    pickup: { type: locationSub, required: true },
    drop: { type: locationSub, required: true },
    items: { type: [itemSub], default: [] },
    vehicleType: { type: String, default: 'mini_truck' },
    scheduledTime: Date,
    assignedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
    estimatedFare: Number,
    actualFare: Number,
    distanceKm: Number,
    driverInfo: driverInfoSub,
  },
  { timestamps: true }
);

logisticsOrderSchema.index({ status: 1, provider: 1 });
logisticsOrderSchema.index({ createdAt: -1 });
logisticsOrderSchema.index({ scheduledTime: 1, status: 1 });

module.exports =
  mongoose.models.LogisticsOrder || mongoose.model('LogisticsOrder', logisticsOrderSchema);
module.exports.ORDER_TYPES = ORDER_TYPES;
module.exports.PROVIDERS = PROVIDERS;
module.exports.STATUSES = STATUSES;
