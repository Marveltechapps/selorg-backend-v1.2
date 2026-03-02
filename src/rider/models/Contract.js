const mongoose = require('mongoose');

const ContractSchema = new mongoose.Schema({
  riderId: {
    type: String,
    required: true,
    unique: true,
    match: /^RIDER-\d+$/,
    index: true,
  },
  riderName: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  renewalDue: {
    type: Boolean,
    required: true,
    default: false,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'expired', 'pending_renewal', 'terminated'],
    default: 'active',
    index: true,
  },
  contractType: {
    type: String,
    default: null,
  },
  terms: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  terminationReason: {
    type: String,
    default: null,
  },
  terminatedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'contracts',
});

// Auto-update status based on dates
ContractSchema.pre('save', function(next) {
  // Don't auto-update if status is terminated (manually set)
  if (this.status === 'terminated') {
    return next();
  }
  
  const now = new Date();
  
  if (this.endDate < now && this.status !== 'expired') {
    this.status = 'expired';
    this.renewalDue = true;
  } else if (this.endDate >= now && this.status === 'expired') {
    this.status = 'active';
  }
  
  // Check if renewal is due (within 30 days of end date)
  const daysUntilEnd = Math.ceil((this.endDate - now) / (1000 * 60 * 60 * 24));
  if (daysUntilEnd <= 30 && daysUntilEnd > 0) {
    this.renewalDue = true;
  }
  
  next();
});

// Indexes
ContractSchema.index({ status: 1, renewalDue: 1 });
ContractSchema.index({ endDate: 1 });

// Create and export the model
const Contract = mongoose.model('Contract', ContractSchema);

module.exports = Contract;

