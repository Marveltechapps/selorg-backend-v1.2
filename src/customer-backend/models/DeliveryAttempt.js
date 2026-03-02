const mongoose = require('mongoose');

const deliveryAttemptSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerOrder',
      required: true,
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
      required: true,
    },
    attemptNumber: { type: Number, required: true, min: 1 },
    timestamp: { type: Date, default: Date.now },
    outcome: {
      type: String,
      enum: ['delivered', 'failed', 'rescheduled'],
      required: true,
    },
    failureReason: {
      type: String,
      enum: [
        'customer_absent', 'wrong_address', 'refused',
        'address_not_found', 'gate_locked', 'phone_unreachable',
        'customer_rescheduled', 'other',
      ],
    },
    proofPhotoUrl: { type: String },
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    otpVerified: { type: Boolean },
    otpAttempts: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    duration: { type: Number },
  },
  { timestamps: true }
);

deliveryAttemptSchema.index({ orderId: 1, attemptNumber: 1 });
deliveryAttemptSchema.index({ riderId: 1, createdAt: -1 });

const DeliveryAttempt =
  mongoose.models.DeliveryAttempt ||
  mongoose.model('DeliveryAttempt', deliveryAttemptSchema);

module.exports = { DeliveryAttempt };
