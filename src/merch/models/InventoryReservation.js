const mongoose = require('mongoose');
const { Schema } = mongoose;

const InventoryReservationSchema = new Schema({
  reservationId: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, trim: true, index: true },
  storeId: { type: String, required: true, trim: true, index: true },
  items: [{
    sku: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true },
    quantityUnit: { type: String, default: 'piece' },
    reservationStatus: {
      type: String,
      enum: ['reserved', 'confirmed', 'cancelled', 'partially_fulfilled', 'fulfilled'],
      default: 'reserved'
    },
    fulfilledQuantity: { type: Number, default: 0 },
    cancelledQuantity: { type: Number, default: 0 },
    reservedFrom: { type: String }, // Batch number, shelf location, etc.
    expiryDate: { type: Date }
  }],
  priority: {
    type: String,
    enum: ['standard', 'high', 'urgent'],
    default: 'standard'
  },
  status: {
    type: String,
    enum: ['active', 'confirmed', 'fulfilled', 'cancelled', 'expired'],
    default: 'active',
    index: true
  },
  reservedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true }, // Reservation expiry
  confirmedAt: { type: Date },
  fulfilledAt: { type: Date },
  cancelledAt: { type: Date },
  cancellationReason: { type: String, trim: true },
  customer: {
    customerId: { type: String, required: true },
    phoneNumber: { type: String },
    email: { type: String }
  },
  metadata: {
    channelSource: { type: String }, // 'mobile_app', 'web', 'pos', etc.
    notes: { type: String },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date }
  },
  autoExpire: { type: Boolean, default: true }, // Auto-expire if not confirmed
  renewalCount: { type: Number, default: 0 },
  maxRenewals: { type: Number, default: 2 },
  createdBy: { type: String, trim: true },
  modifiedBy: { type: String, trim: true }
}, {
  timestamps: true,
  collection: 'inventory_reservations'
});

// Indexes
InventoryReservationSchema.index({ reservationId: 1 });
InventoryReservationSchema.index({ orderId: 1 });
InventoryReservationSchema.index({ storeId: 1, status: 1 });
InventoryReservationSchema.index({ status: 1, expiresAt: 1 });
InventoryReservationSchema.index({ expiresAt: 1 }); // For expiry cleanup jobs
InventoryReservationSchema.index({ 'customer.customerId': 1 });
InventoryReservationSchema.index({ createdAt: -1 });

// Methods
InventoryReservationSchema.methods.isExpired = function() {
  return this.status === 'expired' || new Date() > this.expiresAt;
};

InventoryReservationSchema.methods.getTotalReservedQuantity = function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
};

InventoryReservationSchema.methods.getTotalFulfilledQuantity = function() {
  return this.items.reduce((sum, item) => sum + item.fulfilledQuantity, 0);
};

InventoryReservationSchema.methods.getTotalCancelledQuantity = function() {
  return this.items.reduce((sum, item) => sum + item.cancelledQuantity, 0);
};

InventoryReservationSchema.methods.getUnfulfilledQuantity = function() {
  return this.items.reduce((sum, item) => {
    return sum + (item.quantity - item.fulfilledQuantity - item.cancelledQuantity);
  }, 0);
};

InventoryReservationSchema.methods.canRenew = function() {
  return this.autoExpire && this.renewalCount < this.maxRenewals;
};

InventoryReservationSchema.methods.renewReservation = function(extensionMinutes = 15) {
  if (!this.canRenew()) {
    return false;
  }
  
  const newExpiry = new Date(this.expiresAt.getTime() + extensionMinutes * 60 * 1000);
  this.expiresAt = newExpiry;
  this.renewalCount += 1;
  this.metadata.lastAttemptAt = new Date();
  
  return true;
};

InventoryReservationSchema.methods.confirmReservation = function() {
  if (this.isExpired()) {
    this.status = 'expired';
    return false;
  }
  
  this.status = 'confirmed';
  this.confirmedAt = new Date();
  return true;
};

InventoryReservationSchema.methods.fulfillReservation = function() {
  const allFulfilled = this.items.every(item => item.fulfilledQuantity === item.quantity);
  
  if (allFulfilled) {
    this.status = 'fulfilled';
    this.fulfilledAt = new Date();
  } else {
    this.status = 'partially_fulfilled';
  }
};

InventoryReservationSchema.methods.cancelReservation = function(reason) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.items.forEach(item => {
    item.reservationStatus = 'cancelled';
    item.cancelledQuantity = item.quantity - item.fulfilledQuantity;
  });
};

// Statics
InventoryReservationSchema.statics.createReservation = async function(data) {
  const reservationId = `RES_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Set default expiry to 15 minutes from now
  const expiresAt = data.expiresAt || new Date(Date.now() + 15 * 60 * 1000);
  
  return this.create({
    reservationId,
    expiresAt,
    ...data
  });
};

InventoryReservationSchema.statics.getExpiredReservations = function() {
  return this.find({
    status: { $in: ['active', 'confirmed'] },
    expiresAt: { $lt: new Date() }
  });
};

InventoryReservationSchema.statics.getReservationsByOrder = function(orderId) {
  return this.find({ orderId });
};

InventoryReservationSchema.statics.getActiveReservationsByStore = function(storeId) {
  return this.find({
    storeId,
    status: { $in: ['active', 'confirmed', 'partially_fulfilled'] }
  }).sort({ expiresAt: 1 });
};

InventoryReservationSchema.statics.expireReservations = async function() {
  const expiredReservations = await this.getExpiredReservations();
  
  for (let reservation of expiredReservations) {
    reservation.status = 'expired';
    reservation.items.forEach(item => {
      item.reservationStatus = 'expired';
    });
    await reservation.save();
  }
  
  return expiredReservations.length;
};

module.exports = mongoose.models.InventoryReservation || mongoose.model('InventoryReservation', InventoryReservationSchema);
