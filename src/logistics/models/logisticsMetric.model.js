'use strict';

const mongoose = require('mongoose');

const logisticsMetricSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    logisticsOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogisticsOrder', index: true },
    referenceId: String,
    status: String,
    provider: String,
    orderType: String,
    estimatedFare: Number,
    actualFare: Number,
    distanceKm: Number,
    /** Derived: actualFare / max(distanceKm, epsilon) when delivered */
    costPerKm: Number,
    slaBreached: { type: Boolean, default: false },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

logisticsMetricSchema.index({ recordedAt: -1 });

module.exports =
  mongoose.models.LogisticsMetric || mongoose.model('LogisticsMetric', logisticsMetricSchema);
