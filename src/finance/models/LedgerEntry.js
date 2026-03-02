const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  reference: { type: String, required: true, index: true },
  description: { type: String, required: true },
  accountCode: { type: String, required: true, index: true },
  accountName: { type: String, required: true },
  debit: { type: Number, required: true, default: 0 },
  credit: { type: Number, required: true, default: 0 },
  journalId: { type: String, required: true, index: true },
  sourceModule: { 
    type: String, 
    required: true, 
    enum: ['payments', 'vendor', 'refunds', 'manual'],
    index: true 
  },
  createdBy: { type: String, required: true },
}, {
  timestamps: true,
});

ledgerEntrySchema.index({ accountCode: 1, date: -1 });
ledgerEntrySchema.index({ journalId: 1 });

module.exports = mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerEntrySchema);

