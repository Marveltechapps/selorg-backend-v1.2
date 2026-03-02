const mongoose = require('mongoose');

const VendorRatingSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true, unique: true, index: true },
    overallRating: { type: Number, min: 0, max: 5, default: 0 },
    qcPassRate: { type: Number, min: 0, max: 100, default: 0 },
    complianceScore: { type: Number, min: 0, max: 100, default: 0 },
    auditScore: { type: Number, min: 0, max: 100, default: 0 },
    onTimeDeliveryRate: { type: Number, min: 0, max: 100, default: 0 },
    trend: { 
      type: String, 
      enum: ['up', 'down', 'stable'],
      default: 'stable',
      index: true,
    },
    lastUpdated: { type: Date, default: Date.now },
    calculatedAt: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

VendorRatingSchema.index({ overallRating: -1 });
VendorRatingSchema.index({ qcPassRate: -1 });

module.exports = mongoose.models.VendorRating || mongoose.model('VendorRating', VendorRatingSchema);
