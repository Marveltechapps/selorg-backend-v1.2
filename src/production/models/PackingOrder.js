const mongoose = require('mongoose');

const packingOrderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
    },
    customer_name: {
      type: String,
      required: false,
    },
    order_type: {
      type: String,
      required: false,
    },
    sla_time: {
      type: String,
      required: false,
    },
    sla_status: {
      type: String,
      required: false,
      enum: ['urgent', 'warning', 'normal'],
    },
    picker: {
      type: String,
      required: false,
    },
    packing_station_id: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: false,
      enum: ['pending', 'packing', 'packed'],
      default: 'pending',
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

packingOrderSchema.index({ order_id: 1 });
packingOrderSchema.index({ packing_station_id: 1, status: 1 });
packingOrderSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.PackingOrder || mongoose.model('PackingOrder', packingOrderSchema);

