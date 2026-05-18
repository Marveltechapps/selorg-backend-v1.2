const mongoose = require('mongoose');

const darkStoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    address: {
      line1: { type: String, default: '' },
      line2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },
    serviceRadius: { type: Number, default: 5 }, // km
    isActive: { type: Boolean, default: true },
    operatingHours: {
      open: { type: String, default: '06:00' },
      close: { type: String, default: '23:00' },
    },
    avgPickPackTime: { type: Number, default: 5 }, // minutes
    contactPhone: { type: String, default: '' },
  },
  { timestamps: true }
);

darkStoreSchema.index({ location: '2dsphere' });
darkStoreSchema.index({ isActive: 1 });

const DarkStore =
  mongoose.models.DarkStore ||
  mongoose.model('DarkStore', darkStoreSchema, 'dark_stores');

module.exports = { DarkStore };
