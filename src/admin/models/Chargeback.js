const mongoose = require('mongoose');
const { Schema } = mongoose;

const ChargebackSchema = new Schema({
  chargebackId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  customerId: String,
  customerName: String,
  amount: { type: Number, required: true },
  reason: String,
  status: {
    type: String,
    enum: ['received', 'under_review', 'accepted', 'disputed', 'won', 'lost'],
    default: 'received',
  },
  receivedAt: Date,
  dueDate: Date,
  resolvedAt: Date,
  merchantNotes: String,
  evidence: [String],
}, { timestamps: true });

ChargebackSchema.index({ status: 1 });
ChargebackSchema.index({ dueDate: 1 });

const Chargeback = mongoose.models.Chargeback || mongoose.model('Chargeback', ChargebackSchema);
module.exports = Chargeback;
