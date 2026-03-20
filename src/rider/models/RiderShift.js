const mongoose = require('mongoose');

const RiderShiftSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hubId: {
      type: String,
      index: true,
    },
    hubName: {
      type: String,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    bookedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled'],
      default: 'draft',
      index: true,
    },
    isPeak: {
      type: Boolean,
      default: false,
    },
    basePay: {
      type: Number,
      default: 0,
      min: 0,
    },
    bonus: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    breakMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    walkInBufferMinutes: {
      type: Number,
      default: 15,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: 'rider_shifts',
  }
);

RiderShiftSchema.index({ hubId: 1, date: 1 });
RiderShiftSchema.index({ date: 1, status: 1 });

module.exports = mongoose.models.RiderShift || mongoose.model('RiderShift', RiderShiftSchema);

