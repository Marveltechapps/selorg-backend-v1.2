const mongoose = require('mongoose');

const multiEchelonInventorySchema = new mongoose.Schema({
  echelonId: {
    type: String,
    required: true,
    unique: true,
  },
  sku: {
    type: String,
    required: true,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
  },
  tierData: [{
    tier: {
      type: Number,
      enum: [1, 2, 3],
      description: '1=DC, 2=Hub, 3=Store',
    },
    onHand: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
    inTransit: { type: Number, default: 0 },
    damaged: { type: Number, default: 0 },
  }],
  supplyChainView: {
    totalSystemInventory: { type: Number, default: 0 },
    visibilityScore: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM',
    },
    recommendedAction: String,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'multi_echelon_inventory' });

multiEchelonInventorySchema.index({ sku: 1 });
multiEchelonInventorySchema.index({ warehouseId: 1 });
multiEchelonInventorySchema.index({ echelonId: 1 });

module.exports = mongoose.model('MultiEchelonInventory', multiEchelonInventorySchema);
