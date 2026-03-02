const mongoose = require('mongoose');

const picklistSchema = new mongoose.Schema(
  {
    picklist_id: {
      type: String,
      required: true,
      unique: true,
    },
    store_id: {
      type: String,
      required: false,
    },
    zone: {
      type: String,
      required: true,
      enum: ['Ambient A', 'Ambient B', 'Chiller', 'Frozen'],
    },
    sla_time: {
      type: String,
      required: false,
    },
    sla_status: {
      type: String,
      required: false,
      enum: ['safe', 'atrisk', 'urgent'],
    },
    items_count: {
      type: Number,
      required: false,
      default: 0,
    },
    orders_count: {
      type: Number,
      required: false,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'inprogress', 'completed', 'paused'],
      default: 'pending',
    },
    progress: {
      type: Number,
      required: false,
      min: 0,
      max: 100,
    },
    priority: {
      type: String,
      required: false,
      enum: ['normal', 'high', 'urgent'],
      default: 'normal',
    },
    picker_id: {
      type: String,
      required: false,
    },
    suggested_picker: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      required: false,
      enum: ['auto', 'manual'],
    },
    packing_station_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

picklistSchema.index({ store_id: 1, status: 1 });
picklistSchema.index({ picklist_id: 1 });
picklistSchema.index({ zone: 1 });
picklistSchema.index({ priority: 1 });

module.exports = mongoose.models.Picklist || mongoose.model('Picklist', picklistSchema);

