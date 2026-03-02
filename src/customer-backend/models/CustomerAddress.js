const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    label: { type: String, default: 'Home' },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    latitude: { type: Number },
    longitude: { type: Number },
    isDefault: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

addressSchema.index({ userId: 1 });
addressSchema.index({ userId: 1, isDefault: 1 });
addressSchema.index({ latitude: 1, longitude: 1 });
addressSchema.index({ userId: 1, label: 1 }, { unique: true });

const CustomerAddress =
  mongoose.models.CustomerAddress ||
  mongoose.model('CustomerAddress', addressSchema, 'customer_addresses');

module.exports = { CustomerAddress };
