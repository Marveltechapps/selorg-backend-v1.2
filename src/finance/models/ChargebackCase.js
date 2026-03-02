const mongoose = require('mongoose');

const chargebackCaseSchema = new mongoose.Schema({
  cardNetwork: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  initiatedAt: { type: Date, required: true, index: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['open', 'won', 'lost', 'under_review'],
    index: true 
  },
  reasonCode: { type: String, required: true },
  orderId: { type: String, index: true },
}, {
  timestamps: true,
});

chargebackCaseSchema.index({ status: 1, initiatedAt: -1 });

module.exports = mongoose.models.ChargebackCase || mongoose.model('ChargebackCase', chargebackCaseSchema);

