const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    required: true,
    enum: ['Picker', 'Packer', 'Loader', 'Rider', 'Supervisor', 'Forklift Operator', 'QC Inspector', 'Warehouse Manager'],
    index: true,
  },
  zone: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['Active', 'Break', 'Meeting', 'Offline'],
    default: 'Offline',
    index: true,
  },
  currentShift: {
    type: String,
    default: null,
  },
  currentTask: {
    type: String,
    default: null,
    trim: true,
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    default: null,
  },
  storeName: {
    type: String,
    default: null,
    trim: true,
  },
  phone: { type: String, default: null, trim: true },
  email: { type: String, default: null, trim: true },
  shift: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night', 'full_day'],
    default: null,
  },
  joinedAt: { type: Date, default: null },
  joinDate: { type: String, default: null },
  performance: { type: Number, default: null },
  productivity: { type: Number, default: null },
  hourlyRate: { type: Number, default: null },
}, {
  timestamps: true,
  collection: 'staff',
});

StaffSchema.index({ role: 1, status: 1 });
StaffSchema.index({ zone: 1 });
StaffSchema.index({ storeId: 1 });


module.exports = mongoose.models.Staff || mongoose.model('Staff', StaffSchema);

