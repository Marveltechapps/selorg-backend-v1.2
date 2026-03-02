const mongoose = require('mongoose');
const { Schema } = mongoose;

const IncidentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['store_outage', 'payment_gateway', 'maps_api', 'warehouse', 'rider_shortage'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['critical', 'warning', 'stable'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'resolved', 'closed'],
      default: 'active',
    },
    zoneName: {
      type: String,
    },
    affectedOrders: {
      type: Number,
      default: 0,
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

IncidentSchema.index({ status: 1 });
IncidentSchema.index({ severity: 1 });
IncidentSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Incident || mongoose.model('Incident', IncidentSchema);
