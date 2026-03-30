const mongoose = require('mongoose');

const StorageLocationSchema = new mongoose.Schema({
  warehouseKey: {
    type: String,
    trim: true,
    index: true,
  },
  id: {
    type: String,
    required: true,
    index: true,
  },
  aisle: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  rack: {
    type: Number,
    required: true,
    min: 1,
  },
  shelf: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    required: true,
    enum: ['occupied', 'empty', 'restricted'],
    default: 'empty',
    index: true,
  },
  sku: {
    type: String,
    default: null,
    trim: true,
    index: true,
  },
  quantity: {
    type: Number,
    default: null,
    min: 0,
  },
  zone: {
    type: String,
    default: null,
    trim: true,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'storage_locations',
});

// Virtual: bin as alias for shelf (zone-aisle-rack-bin convention per darkstore ops plan)
StorageLocationSchema.virtual('bin').get(function () {
  return this.shelf != null ? this.shelf : null;
});

// Compound indexes for location lookup (tenant-safe)
StorageLocationSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });
StorageLocationSchema.index(
  { warehouseKey: 1, aisle: 1, rack: 1, shelf: 1 },
  { unique: true }
);
StorageLocationSchema.index({ status: 1, zone: 1 });
StorageLocationSchema.index({ sku: 1 });


module.exports = mongoose.models.StorageLocation || mongoose.model('StorageLocation', StorageLocationSchema);

