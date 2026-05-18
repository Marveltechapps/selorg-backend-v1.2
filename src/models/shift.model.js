/**
 * Shift Model
 * File: src/models/shift.model.js
 *
 * P2.2: Shift with explicit type discriminator
 * Distinguishes between picker shifts and rider shifts
 */

const mongoose = require('mongoose');

const SHIFT_TYPES = {
  PICKER_SHIFT: 'PICKER_SHIFT',
  RIDER_SHIFT: 'RIDER_SHIFT'
};

const shiftSchema = new mongoose.Schema(
  {
    // P2.2: Type discriminator - identifies shift type
    shiftType: {
      type: String,
      enum: Object.values(SHIFT_TYPES),
      required: true,
      index: true
    },

    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    // Shift details
    startTime: {
      type: Date,
      required: true,
      index: true
    },
    endTime: {
      type: Date,
      required: true
    },
    duration: Number, // in minutes

    // Status
    status: {
      type: String,
      enum: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true
    },

    // Performance metrics
    ordersAssigned: {
      type: Number,
      default: 0
    },
    ordersCompleted: {
      type: Number,
      default: 0
    },
    ordersPickedUp: {
      type: Number,
      default: 0 // For picker shifts
    },
    ordersDelivered: {
      type: Number,
      default: 0 // For rider shifts
    },

    // Location (for rider shifts)
    serviceArea: {
      zone: String,
      latitude: Number,
      longitude: Number,
      radius: Number // kilometers
    },

    // Earnings (for shifts)
    earnings: {
      base: {
        type: Number,
        default: 0
      },
      incentives: {
        type: Number,
        default: 0
      },
      total: {
        type: Number,
        default: 0
      }
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
    completedAt: Date
  },
  {
    timestamps: true,
    collection: 'shifts'
  }
);

// Composite index: user + shift type + date
shiftSchema.index({ userId: 1, shiftType: 1, startTime: -1 });

// Index for active shifts
shiftSchema.index({ status: 1, endTime: 1 });

const Shift = mongoose.model('Shift', shiftSchema);

module.exports = {
  Shift,
  SHIFT_TYPES
};
