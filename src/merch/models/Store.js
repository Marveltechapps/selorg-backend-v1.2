const mongoose = require('mongoose');
const { Schema } = mongoose;
const DAY_KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const StoreSchema = new Schema({
  // Identity (code required for new creates; optional for legacy docs)
  code: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true,
    maxlength: 20,
    match: /^[A-Z0-9-]+$/,
  },
  name: { type: String, required: true },
  type: { type: String, enum: ['store', 'dark_store', 'warehouse'], required: true, default: 'store' },

  // Location
  address: { type: String, required: true },
  cityId: { type: Schema.Types.ObjectId, ref: 'City' },
  zoneId: { type: Schema.Types.ObjectId, ref: 'Zone' },
  state: { type: String },
  pincode: { type: String },
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  // Legacy
  x: { type: Number },
  y: { type: Number },
  zones: [{ type: String }],

  // Status & Operations
  status: { type: String, enum: ['active', 'offline', 'inactive', 'maintenance'], default: 'active' },
  serviceStatus: { type: String, enum: ['Full', 'Partial', 'None'] },
  deliveryRadius: { type: Number, default: 5, min: 1, max: 100 },
  maxCapacity: { type: Number, default: 100 },
  currentLoad: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator(v) {
        if (v == null) return true;
        if (this.maxCapacity == null) return true;
        return Number(v) <= Number(this.maxCapacity);
      },
      message: 'currentLoad cannot exceed maxCapacity',
    },
  },

  // Contact
  phone: { type: String },
  email: { type: String, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  managerId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },

  // Operational Hours - keys: monday, tuesday, etc.; values: { open, close, isOpen }
  operationalHours: {
    type: Map,
    of: {
      open: String,
      close: String,
      isOpen: Boolean,
    },
    default: () => new Map(),
    validate: {
      validator(value) {
        if (!value) return true;
        const entries = value instanceof Map ? Object.fromEntries(value) : value;
        const keys = Object.keys(entries);
        if (keys.length === 0) return true;
        const hasAllDays = DAY_KEYS.every((day) => Object.prototype.hasOwnProperty.call(entries, day));
        if (!hasAllDays) return false;
        return DAY_KEYS.every((day) => {
          const slot = entries[day];
          return (
            slot &&
            typeof slot.open === 'string' &&
            typeof slot.close === 'string' &&
            typeof slot.isOpen === 'boolean'
          );
        });
      },
      message: 'operationalHours must include Monday-Sunday with open, close, and isOpen',
    },
  },

  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

StoreSchema.pre('validate', function storePreValidate(next) {
  if (this.code) {
    this.code = String(this.code).trim().toUpperCase();
  }
  next();
});

StoreSchema.index({ code: 1 }, { unique: true });
StoreSchema.index({ cityId: 1, status: 1 });
StoreSchema.index({ zoneId: 1 });
StoreSchema.index({ type: 1, status: 1 });
StoreSchema.index({ name: 'text', code: 'text', address: 'text' });

module.exports = mongoose.models.Store || mongoose.model('Store', StoreSchema);
