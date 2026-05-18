const mongoose = require('mongoose');

const warehouseAllocationSchema = new mongoose.Schema({
  allocationId: {
    type: String,
    required: true,
    unique: true,
  },
  allocationDate: {
    type: Date,
    default: Date.now,
  },
  allocationCycle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReplenishmentCycle',
  },
  sourceWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
  },
  allocations: [{
    destinationWarehouse: mongoose.Schema.Types.ObjectId,
    sku: String,
    requestedQuantity: Number,
    allocatedQuantity: Number,
    priority: Number,
    reason: String,
    ruleApplied: mongoose.Schema.Types.ObjectId,
  }],
  totalAllocated: {
    type: Number,
    default: 0,
  },
  totalValue: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PROPOSED', 'APPROVED', 'FULFILLED'],
    default: 'DRAFT',
  },
  approvals: [{
    approver: mongoose.Schema.Types.ObjectId,
    approvalDate: Date,
    comments: String,
  }],
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'warehouse_allocations' });

warehouseAllocationSchema.index({ allocationId: 1 });
warehouseAllocationSchema.index({ allocationDate: 1 });
warehouseAllocationSchema.index({ sourceWarehouse: 1 });
warehouseAllocationSchema.index({ status: 1 });

module.exports = mongoose.model('WarehouseAllocation', warehouseAllocationSchema);
