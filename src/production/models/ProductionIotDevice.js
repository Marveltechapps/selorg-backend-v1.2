const mongoose = require('mongoose');

const productionIotDeviceSchema = new mongoose.Schema(
  {
    device_id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    device_type: {
      type: String,
      required: true,
      enum: ['HSD', 'Sensor', 'Monitor'],
    },
    status: {
      type: String,
      required: true,
      enum: ['online', 'offline', 'warning'],
    },
    battery: { type: Number, min: 0, max: 100 },
    last_reading: { type: String },
    location: { type: String },
    store_id: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

productionIotDeviceSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.ProductionIotDevice || mongoose.model('ProductionIotDevice', productionIotDeviceSchema);
