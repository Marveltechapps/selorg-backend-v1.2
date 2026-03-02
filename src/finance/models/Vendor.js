const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  email: { type: String, index: true },
  accountNumber: { type: String },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

module.exports = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);

