const mongoose = require('mongoose');
const { Schema } = mongoose;

const CatalogVersionSchema = new Schema({
  version: { type: Number, required: true, unique: true, index: true },
  timestamp: { type: Date, default: Date.now, index: { unique: false } },
  snapshotData: {
    totalProducts: { type: Number, default: 0 },
    categories: { type: Number, default: 0 },
    tags: [{ type: String }],
    lastModifiedDate: { type: Date }
  },
  changedSKUs: [{
    sku: { type: String, required: true },
    change: { type: String, enum: ['created', 'updated', 'deleted'], required: true },
    changeDetails: Schema.Types.Mixed
  }],
  reason: { type: String, trim: true, default: 'Automatic sync' },
  createdBy: { type: String, required: true, trim: true },
  isRollbackable: { type: Boolean, default: true },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: String, trim: true },
  approvedAt: { type: Date },
  metadata: {
    changeCount: { type: Number, default: 0 },
    duration: { type: Number }, // Time taken to complete version in seconds
    importedFrom: { type: String } // e.g., 'bulk_import', 'api', 'manual'
  }
}, {
  timestamps: true,
  collection: 'catalog_versions'
});

// Indexes for performance
CatalogVersionSchema.index({ timestamp: -1 }); // Latest versions first
CatalogVersionSchema.index({ createdBy: 1, timestamp: -1 });
CatalogVersionSchema.index({ approvalStatus: 1 });

// Methods
CatalogVersionSchema.methods.getVersionDiff = function(otherVersion) {
  if (!otherVersion) return [];
  
  const thisSkus = this.changedSKUs.map(s => s.sku);
  const otherSkus = otherVersion.changedSKUs.map(s => s.sku);
  
  const diff = {
    added: thisSkus.filter(s => !otherSkus.includes(s)),
    removed: otherSkus.filter(s => !thisSkus.includes(s)),
    changed: thisSkus.filter(s => otherSkus.includes(s))
  };
  
  return diff;
};

CatalogVersionSchema.statics.createNewVersion = async function(data) {
  const latestVersion = await this.findOne().sort({ version: -1 });
  const nextVersion = (latestVersion?.version || 0) + 1;
  
  return this.create({
    version: nextVersion,
    ...data
  });
};

module.exports = mongoose.models.CatalogVersion || mongoose.model('CatalogVersion', CatalogVersionSchema);
