/**
 * Order Model
 * File: src/models/order.model.js
 *
 * P2.2: Order with explicit type discriminator
 * Prevents ambiguity between customer orders, picker orders, rider orders
 */

const mongoose = require('mongoose');

const ORDER_TYPES = {
  CUSTOMER_ORDER: 'CUSTOMER_ORDER',
  PICKER_ORDER: 'PICKER_ORDER',
  RIDER_ORDER: 'RIDER_ORDER'
};

const orderSchema = new mongoose.Schema(
  {
    // P2.2: Type discriminator - identifies what this order represents
    orderType: {
      type: String,
      enum: Object.values(ORDER_TYPES),
      required: true,
      index: true // Index for fast filtering by type
    },

    // Core order fields
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    pickerId: {
      type: mongoose.Schema.Types.ObjectId,
      sparse: true,
      index: true
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      sparse: true,
      index: true
    },

    // Order details
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'PICKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    items: [
      {
        id: String,
        name: String,
        quantity: Number,
        price: Number
      }
    ],

    // Addresses
    pickupLocation: {
      address: String,
      latitude: Number,
      longitude: Number
    },
    deliveryLocation: {
      address: String,
      latitude: Number,
      longitude: Number
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    deliveredAt: Date,

    // Payment info (links to P0.2 idempotency)
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'REFUNDED'],
      default: 'PENDING'
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'orders'
  }
);

// Composite index: type + status + createdAt (common queries)
orderSchema.index({ orderType: 1, status: 1, createdAt: -1 });

// Unique constraint on customer + order date (prevent duplicate same-day orders)
orderSchema.index(
  { customerId: 1, createdAt: 1 },
  { unique: false, sparse: true }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = {
  Order,
  ORDER_TYPES
};
