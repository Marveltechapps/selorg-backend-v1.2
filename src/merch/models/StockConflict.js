const mongoose = require('mongoose');
const { Schema } = mongoose;

const StockConflictSchema = new Schema({
  sku: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  region: { type: String, required: true },
  severity: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  availableStock: { type: Number, required: true },
  committedStock: { type: Number, required: true },
  shortfall: { type: Number, required: true },
  status: { type: String, enum: ['Open', 'Resolved', 'In Progress'], default: 'Open' }
}, {
  timestamps: true
});

// Indexes for performance
StockConflictSchema.index({ status: 1, severity: 1 });
StockConflictSchema.index({ sku: 1 });
StockConflictSchema.index({ region: 1, status: 1 });

module.exports = mongoose.models.StockConflict || mongoose.model('StockConflict', StockConflictSchema);
