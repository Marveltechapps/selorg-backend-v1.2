const mongoose = require('mongoose');

const vendorProfileSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    required: true,
    unique: true,
  },
  vendorName: {
    type: String,
    required: true,
  },
  vendorCode: {
    type: String,
    required: true,
    unique: true,
  },
  vendorType: {
    type: String,
    enum: ['DIRECT_VENDOR', 'DISTRIBUTOR', 'CONSOLIDATOR'],
    required: true,
  },
  contactInfo: {
    primaryContact: String,
    email: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
  },
  paymentTerms: {
    termName: String,
    daysDue: Number,
    discountPercentage: Number,
  },
  leadTime: {
    type: Number,
    description: 'Average days from PO to delivery',
  },
  minimumOrderValue: {
    type: Number,
    default: 0,
  },
  performanceMetrics: {
    onTimeDeliveryPercentage: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 0, min: 0, max: 100 },
    responseTime: { type: Number, default: 0 },
    reliabilityScore: { type: Number, default: 0, min: 0, max: 100 },
    totalOrders: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
  },
  bankDetails: {
    bankName: String,
    accountHolder: String,
    accountNumber: String,
    ifscCode: String,
  },
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'vendor_profiles' });

vendorProfileSchema.index({ vendorId: 1 });
vendorProfileSchema.index({ vendorName: 1 });
vendorProfileSchema.index({ vendorCode: 1 });
vendorProfileSchema.index({ vendorType: 1 });

module.exports = mongoose.model('VendorProfile', vendorProfileSchema);
