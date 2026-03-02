const mongoose = require('mongoose');
const { Schema } = mongoose;

const StoreSchema = new Schema({
  // Identity (code required for new creates; optional for legacy docs)
  code: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['store', 'dark_store', 'warehouse'], required: true, default: 'store' },

  // Location
  address: { type: String, required: true },
  cityId: { type: Schema.Types.ObjectId, ref: 'City' },
  zoneId: { type: Schema.Types.ObjectId, ref: 'Zone' },
  state: { type: String },
  pincode: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  // Legacy
  x: { type: Number },
  y: { type: Number },
  zones: [{ type: String }],

  // Status & Operations
  status: { type: String, enum: ['active', 'offline', 'inactive', 'maintenance'], default: 'active' },
  serviceStatus: { type: String, enum: ['Full', 'Partial', 'None'] },
  deliveryRadius: { type: Number, default: 5 },
  maxCapacity: { type: Number, default: 100 },
  currentLoad: { type: Number, default: 0 },

  // Contact
  phone: { type: String },
  email: { type: String },
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
  },

  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

StoreSchema.index({ code: 1 }, { unique: true });
StoreSchema.index({ cityId: 1, status: 1 });
StoreSchema.index({ zoneId: 1 });
StoreSchema.index({ type: 1, status: 1 });
StoreSchema.index({ name: 'text', code: 'text', address: 'text' });

module.exports = mongoose.models.Store || mongoose.model('Store', StoreSchema);
