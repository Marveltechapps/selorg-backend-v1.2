const mongoose = require('mongoose');

const journalEntryLineSchema = new mongoose.Schema({
  accountCode: { type: String, required: true },
  accountName: { type: String },
  debit: { type: Number, required: true, default: 0 },
  credit: { type: Number, required: true, default: 0 },
  description: { type: String },
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  reference: { type: String, required: true, unique: true, index: true },
  memo: { type: String },
  lines: [journalEntryLineSchema],
  status: { 
    type: String, 
    required: true, 
    enum: ['draft', 'posted'],
    default: 'draft',
    index: true 
  },
  createdBy: { type: String, required: true },
}, {
  timestamps: true,
});

journalEntrySchema.index({ date: -1, status: 1 });

module.exports = mongoose.models.JournalEntry || mongoose.model('JournalEntry', journalEntrySchema);

