const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'getting-packed', 'on-the-way', 'arrived', 'delivered', 'cancelled'],
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: '' },
    actor: { type: String, default: '' },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct', required: true },
    productName: { type: String, default: '' },
    variantId: { type: String, default: '' },
    variantSize: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    image: { type: String, default: '' },
    itemStatus: {
      type: String,
      enum: ['picked', 'not_found', 'damaged', 'substituted', 'delivered', 'pending'],
      default: 'pending',
    },
    substituteProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' },
    substituteProductName: { type: String, default: '' },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    orderNumber: { type: String, required: true, unique: true },
    items: [orderItemSchema],
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'getting-packed', 'on-the-way', 'arrived', 'delivered', 'cancelled'],
      default: 'pending',
    },
    timeline: [timelineEventSchema],
    cancellationReason: { type: String, default: '' },
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerAddress' },
    deliveryAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      landmark: String,
    },
    deliveryNotes: { type: String, default: '' },
    paymentMethodId: { type: String, default: '' },
    paymentMethod: {
      methodType: { type: String, enum: ['card', 'upi', 'cash', 'wallet'], default: 'cash' },
      last4: String,
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'cod_pending', 'pending', 'failed'],
      default: 'pending',
    },
    itemTotal: { type: Number, required: true, default: 0 },
    adjustedTotal: { type: Number },
    handlingCharge: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    walletDeduction: { type: Number, default: 0 },
    totalBill: { type: Number, required: true, default: 0 },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date },
    deliveryOtp: { type: String },
    otpVerified: { type: Boolean, default: false },
    otpAttempts: { type: Number, default: 0 },
    refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundRequest' },
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected', 'processed'],
      default: 'none',
    },
    refundAmount: { type: Number, default: 0 },
    supportTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminSupportTicket' },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
    ratingScore: { type: Number, min: 1, max: 5 },
    ratingComment: { type: String, default: '' },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ storeId: 1, status: 1 });
orderSchema.index({ riderId: 1, status: 1 });

const Order =
  mongoose.models.CustomerOrder ||
  mongoose.model('CustomerOrder', orderSchema, 'customer_orders');

module.exports = { Order };
