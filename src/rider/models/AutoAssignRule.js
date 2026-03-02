const mongoose = require('mongoose');

const criteriaSchema = new mongoose.Schema({
  maxRadiusKm: { type: Number, default: 5, min: 0.5, max: 50 },
  maxOrdersPerRider: { type: Number, default: 3, min: 1, max: 10 },
  preferSameZone: { type: Boolean, default: true },
  priorityWeight: { type: Number, default: 5, min: 0, max: 10 },
  distanceWeight: { type: Number, default: 5, min: 0, max: 10 },
  etaWeight: { type: Number, default: 5, min: 0, max: 10 },
}, { _id: false });

const AutoAssignRuleSchema = new mongoose.Schema({
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
  isActive: {
    type: Boolean,
    default: false,
  },
  criteria: {
    type: criteriaSchema,
    default: () => ({}),
  },
  createdBy: {
    type: String,
    default: 'system',
  },
}, {
  timestamps: true,
  collection: 'auto_assign_rules',
});

// Ensure updatedAt is set on save
AutoAssignRuleSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.AutoAssignRule || mongoose.model('AutoAssignRule', AutoAssignRuleSchema);
