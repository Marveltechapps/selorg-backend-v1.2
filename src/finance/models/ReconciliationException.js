const mongoose = require('mongoose');

const reconciliationExceptionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  sourceType: { 
    type: String, 
    required: true, 
    enum: ['gateway', 'bank', 'internal'],
    index: true 
  },
  gateway: { type: String, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  status: { 
    type: String, 
    required: true, 
    enum: ['open', 'in_review', 'resolved', 'ignored'],
    index: true 
  },
  reasonCode: { type: String, required: true },
  details: { type: String },
  suggestedAction: { 
    type: String, 
    enum: ['investigate', 'resolve', 'write_off', 'retry_match'] 
  },
  createdAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
});

reconciliationExceptionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.ReconciliationException || mongoose.model('ReconciliationException', reconciliationExceptionSchema);

