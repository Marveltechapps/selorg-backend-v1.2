const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReplenishmentOrderSchema = new Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  poNumber: { type: String, trim: true }, // Purchase Order number from vendor
  cycleId: { type: String, trim: true, index: true },
  storeId: { type: String, required: true, trim: true, index: true },
  sku: { type: String, required: true, trim: true, index: true },
  vendorId: { type: String, required: true, trim: true },
  vendorName: { type: String, trim: true },
  quantity: { type: Number, required: true },
  quantityUnit: { type: String, default: 'piece' },
  pricing: {
    unitCost: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    netCost: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    tax: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    finalTotal: { type: Number, required: true }
  },
  orderStatus: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'sent_to_vendor', 'confirmed', 'shipped', 'received', 'completed', 'cancelled'],
    default: 'draft',
    index: true
  },
  timeline: {
    createdAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    confirmedAt: { type: Date },
    expectedDeliveryDate: { type: Date },
    shippedAt: { type: Date },
    receivedAt: { type: Date },
    completedAt: { type: Date }
  },
  delivery: {
    trackingNumber: { type: String, trim: true },
    carrier: { type: String, trim: true },
    estimatedDeliveryDate: { type: Date },
    actualDeliveryDate: { type: Date },
    receivingLocation: { type: String, trim: true },
    receivedQuantity: { type: Number },
    damageFreeQuantity: { type: Number },
    inspectionNotes: { type: String, trim: true }
  },
  approval: {
    requiredApprovalLevel: { type: String, enum: ['store_manager', 'regional', 'corporate'], default: 'store_manager' },
    approvedBy: { type: String, trim: true },
    approvalNotes: { type: String, trim: true },
    rejectionReason: { type: String, trim: true }
  },
  paymentInfo: {
    method: { type: String, enum: ['COD', 'prepaid', 'net-30', 'net-60'], default: 'COD' },
    status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    paidAmount: { type: Number, default: 0 },
    paidDate: { type: Date },
    invoiceNumber: { type: String, trim: true },
    notes: { type: String, trim: true }
  },
  metadata: {
    sourceSystem: { type: String }, // 'replenishment_cycle', 'manual_order'
    createdBy: { type: String, required: true, trim: true },
    lastModifiedBy: { type: String, trim: true },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    internalNotes: { type: String, trim: true },
    vendorNotes: { type: String, trim: true }
  }
}, {
  timestamps: true,
  collection: 'replenishment_orders'
});

// Indexes
ReplenishmentOrderSchema.index({ orderId: 1 });
ReplenishmentOrderSchema.index({ storeId: 1, orderStatus: 1 });
ReplenishmentOrderSchema.index({ vendorId: 1, orderStatus: 1 });
ReplenishmentOrderSchema.index({ sku: 1, storeId: 1 });
ReplenishmentOrderSchema.index({ 'timeline.createdAt': -1 });

// Methods
ReplenishmentOrderSchema.methods.calculateCosts = function() {
  this.pricing.totalCost = this.pricing.unitCost * this.quantity;
  this.pricing.discountAmount = (this.pricing.totalCost * this.pricing.discountPercent) / 100;
  this.pricing.netCost = this.pricing.totalCost - this.pricing.discountAmount;
  this.pricing.tax = (this.pricing.netCost * 0.18) || 0; // 18% tax (configurable)
  this.pricing.finalTotal = this.pricing.netCost + this.pricing.tax + this.pricing.shippingCost;
};

ReplenishmentOrderSchema.methods.submitForApproval = function() {
  this.orderStatus = 'pending_approval';
  this.timeline.submittedAt = new Date();
};

ReplenishmentOrderSchema.methods.approve = function(approvedBy, notes = '') {
  this.orderStatus = 'approved';
  this.approval.approvedBy = approvedBy;
  this.approval.approvalNotes = notes;
  this.timeline.approvedAt = new Date();
};

ReplenishmentOrderSchema.methods.reject = function(reason) {
  this.orderStatus = 'cancelled';
  this.approval.rejectionReason = reason;
};

ReplenishmentOrderSchema.methods.sendToVendor = function() {
  this.orderStatus = 'sent_to_vendor';
};

ReplenishmentOrderSchema.methods.confirmReceipt = function(receivedQty, inspectionNotes = '') {
  this.orderStatus = 'received';
  this.delivery.receivedQuantity = receivedQty;
  this.delivery.actualDeliveryDate = new Date();
  this.delivery.inspectionNotes = inspectionNotes;
  this.timeline.receivedAt = new Date();

  // Damage check
  const damaged = this.quantity - receivedQty;
  this.delivery.damageFreeQuantity = receivedQty - (damaged > 0 ? damaged : 0);
};

ReplenishmentOrderSchema.methods.markAsPaid = function(amount, invoiceNumber = '') {
  if (amount >= this.pricing.finalTotal) {
    this.paymentInfo.status = 'paid';
    this.paymentInfo.paidAmount = this.pricing.finalTotal;
  } else {
    this.paymentInfo.status = 'partial';
    this.paymentInfo.paidAmount = amount;
  }

  this.paymentInfo.paidDate = new Date();
  if (invoiceNumber) {
    this.paymentInfo.invoiceNumber = invoiceNumber;
  }
};

ReplenishmentOrderSchema.methods.complete = function() {
  this.orderStatus = 'completed';
  this.timeline.completedAt = new Date();
};

// Statics
ReplenishmentOrderSchema.statics.createOrder = async function(data) {
  const orderId = `PO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const order = new this({
    orderId,
    ...data
  });

  order.calculateCosts();
  await order.save();

  return order;
};

ReplenishmentOrderSchema.statics.getOrdersByStatus = function(storeId, status) {
  return this.find({
    storeId,
    orderStatus: status
  }).sort({ 'timeline.createdAt': -1 });
};

ReplenishmentOrderSchema.statics.getPendingApprovals = function(storeId) {
  return this.find({
    storeId,
    orderStatus: 'pending_approval'
  }).sort({ 'timeline.submittedAt': 1 });
};

ReplenishmentOrderSchema.statics.getPendingDeliveries = function(storeId) {
  return this.find({
    storeId,
    orderStatus: { $in: ['sent_to_vendor', 'confirmed', 'shipped'] }
  }).sort({ 'delivery.estimatedDeliveryDate': 1 });
};

module.exports = mongoose.models.ReplenishmentOrder || mongoose.model('ReplenishmentOrder', ReplenishmentOrderSchema);
