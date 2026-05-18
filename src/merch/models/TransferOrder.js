const mongoose = require('mongoose');

const transferOrderSchema = new mongoose.Schema({
  transferId: {
    type: String,
    required: true,
    unique: true,
  },
  referenceNumber: {
    type: String,
    unique: true,
  },
  sourceWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
  },
  destinationWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
  },
  items: [{
    sku: String,
    quantityRequested: Number,
    quantityShipped: { type: Number, default: 0 },
    quantityReceived: { type: Number, default: 0 },
    unitCost: Number,
  }],
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'SHIPPED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'],
    default: 'DRAFT',
  },
  priority: {
    type: String,
    enum: ['URGENT', 'HIGH', 'NORMAL', 'LOW'],
    default: 'NORMAL',
  },
  timeline: {
    createdDate: { type: Date, default: Date.now },
    approvedDate: Date,
    shipmentDate: Date,
    expectedDeliveryDate: Date,
    actualDeliveryDate: Date,
  },
  shippingInfo: {
    carrier: String,
    trackingNumber: String,
    cost: Number,
    estimatedDays: Number,
  },
  approvals: [{
    approver: mongoose.Schema.Types.ObjectId,
    approvalDate: Date,
    comments: String,
  }],
  totalValue: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
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
}, { collection: 'transfer_orders' });

transferOrderSchema.index({ transferId: 1 });
transferOrderSchema.index({ sourceWarehouse: 1 });
transferOrderSchema.index({ destinationWarehouse: 1 });
transferOrderSchema.index({ status: 1 });
transferOrderSchema.index({ 'timeline.createdDate': 1 });

module.exports = mongoose.model('TransferOrder', transferOrderSchema);
