const mongoose = require('mongoose');

const truckSchema = new mongoose.Schema(
  {
    truck_id: {
      type: String,
      required: true,
      unique: true,
    },
    store_id: {
      type: String,
      required: true,
    },
    supplier: {
      type: String,
      required: false,
    },
    expected_arrival: {
      type: String,
      required: true,
    },
    actual_arrival: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['scheduled', 'in_transit', 'arrived', 'unloaded', 'completed'],
      default: 'scheduled',
    },
    date: {
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

truckSchema.index({ truck_id: 1 });
truckSchema.index({ store_id: 1, date: 1 });
truckSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.Truck || mongoose.model('Truck', truckSchema);

