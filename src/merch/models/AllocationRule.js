const mongoose = require('mongoose');

const allocationRuleSchema = new mongoose.Schema({
  ruleId: {
    type: String,
    required: true,
    unique: true,
  },
  ruleName: {
    type: String,
    required: true,
  },
  priority: {
    type: Number,
    required: true,
    description: '1=highest priority',
  },
  applicableProducts: [{
    type: String,
    description: 'SKU or SKU patterns',
  }],
  allocationStrategy: {
    type: String,
    enum: ['FIFO', 'LIFO', 'CLOSEST_DC', 'CHEAPEST', 'FASTEST'],
    required: true,
  },
  minStockThreshold: {
    type: Number,
    default: 0,
  },
  maxAllocationPerCycle: {
    type: Number,
    required: true,
  },
  leadTimeTarget: {
    type: Number,
    description: 'Target days for delivery',
  },
  costOptimization: {
    type: Boolean,
    default: false,
  },
  constraints: [{
    warehouseId: mongoose.Schema.Types.ObjectId,
    maxAllocation: Number,
    holdbackPercentage: Number,
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'allocation_rules' });

allocationRuleSchema.index({ priority: 1 });
allocationRuleSchema.index({ ruleId: 1 });
allocationRuleSchema.index({ applicableProducts: 1 });

module.exports = mongoose.model('AllocationRule', allocationRuleSchema);
