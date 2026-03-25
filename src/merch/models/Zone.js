const mongoose = require('mongoose');
const { Schema } = mongoose;

// Admin Geofence Manager: polygon (lat/lng), center, city, region, settings, analytics
// Legacy merch: points (x,y), type Serviceable|Exclusion|Priority|Promo-Only, status Active|Inactive|Pending
const ALL_TYPES = ['Serviceable', 'Exclusion', 'Priority', 'Promo-Only', 'standard', 'express', 'no-service', 'premium', 'surge'];
const ALL_STATUSES = ['Active', 'Inactive', 'Pending', 'active', 'inactive', 'testing'];

const ZoneSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, sparse: true },
  cityId: { type: Schema.Types.ObjectId, ref: 'City', required: true },
  type: { type: String, enum: ALL_TYPES, default: 'standard' },
  status: { type: String, enum: ALL_STATUSES, default: 'active' },
  isVisible: { type: Boolean, default: true },
  color: { type: String, default: '#3b82f6' },
  areaSqKm: { type: Number, default: 0 },
  promoCount: { type: Number, default: 0 },
  defaultCapacity: { type: Number },
  points: [{
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  }],
  // Admin Geofence Manager: geographic polygon
  polygon: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }],
  center: {
    lat: { type: Number },
    lng: { type: Number }
  },
  city: { type: String },
  region: { type: String },
  settings: {
    deliveryFee: { type: Number, default: 39 },
    minOrderValue: { type: Number, default: 149 },
    maxDeliveryRadius: { type: Number, default: 5 },
    estimatedDeliveryTime: { type: Number, default: 30 },
    surgeMultiplier: { type: Number, default: 1.0 },
    maxCapacity: { type: Number, default: 100 },
    priority: { type: Number, default: 5 },
    availableSlots: [{ type: String }]
  },
  analytics: {
    areaSize: { type: Number, default: 0 },
    population: { type: Number, default: 0 },
    activeOrders: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    dailyOrders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    avgDeliveryTime: { type: Number, default: 0 },
    riderCount: { type: Number, default: 0 },
    capacityUsage: { type: Number, default: 0 },
    customerSatisfaction: { type: Number, default: 0 }
  },
  createdBy: { type: String },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

ZoneSchema.pre('validate', function zonePreValidate(next) {
  if (!this.center && Array.isArray(this.polygon) && this.polygon.length > 0) {
    const sum = this.polygon.reduce(
      (acc, point) => ({
        lat: acc.lat + Number(point.lat || 0),
        lng: acc.lng + Number(point.lng || 0),
      }),
      { lat: 0, lng: 0 }
    );
    this.center = {
      lat: sum.lat / this.polygon.length,
      lng: sum.lng / this.polygon.length,
    };
  }
  next();
});

ZoneSchema.index({ cityId: 1 });
ZoneSchema.index({ status: 1 });
ZoneSchema.index({ city: 1 });
ZoneSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Zone || mongoose.model('Zone', ZoneSchema);
