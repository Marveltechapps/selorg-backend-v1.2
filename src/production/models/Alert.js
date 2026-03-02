const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    alert_id: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['sla_breach', 'delayed_delivery', 'rider_no_show', 'zone_deviation', 'vehicle_breakdown', 'rto_return', 'other'],
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      required: true,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'],
      default: 'open',
    },
    source: {
      orderId: {
        type: String,
        required: false,
      },
      riderId: {
        type: String,
        required: false,
      },
      riderName: {
        type: String,
        required: false,
      },
      vehicleId: {
        type: String,
        required: false,
      },
      zone: {
        type: String,
        required: false,
      },
      lat: {
        type: Number,
        required: false,
      },
      lng: {
        type: Number,
        required: false,
      },
    },
    actionsSuggested: {
      type: [String],
      default: [],
      enum: ['notify_customer', 'reassign_rider', 'call_rider', 'mark_offline', 'view_location', 'add_note', 'resolve', 'acknowledge'],
    },
    timeline: {
      type: [
        {
          at: {
            type: String,
            required: true,
          },
          status: {
            type: String,
            required: true,
          },
          note: {
            type: String,
            required: false,
          },
          actor: {
            type: String,
            required: false,
          },
        },
      ],
      default: [],
    },
    store_id: {
      type: String,
      required: true,
    },
    created_at: {
      type: String,
      required: true,
    },
    updated_at: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

alertSchema.index({ alert_id: 1 });
alertSchema.index({ store_id: 1, status: 1 });
alertSchema.index({ store_id: 1, priority: 1 });
alertSchema.index({ store_id: 1, type: 1 });
alertSchema.index({ 'source.orderId': 1 });
alertSchema.index({ 'source.riderId': 1 });

module.exports = mongoose.models.Alert || mongoose.model('Alert', alertSchema);

