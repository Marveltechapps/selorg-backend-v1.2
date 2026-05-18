const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  warehouseId: {
    type: String,
    required: true,
    unique: true,
  },
  warehouseName: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    enum: ['DC', 'REGIONAL_HUB', 'STORE'],
    required: true,
  },
  tier: {
    type: Number,
    enum: [1, 2, 3],
    required: true,
    description: '1=DC, 2=Hub, 3=Store',
  },
  parentWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    default: null,
  },
  childWarehouses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  }],
  location: {
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
  },
  capacity: {
    maxCapacity: {
      type: Number,
      description: 'Maximum SKUs that can be stored',
    },
    currentUtilization: {
      type: Number,
      default: 0,
    },
  },
  operatingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'warehouses' });

warehouseSchema.index({ warehouseName: 1 });
warehouseSchema.index({ code: 1 });
warehouseSchema.index({ type: 1 });
warehouseSchema.index({ tier: 1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
