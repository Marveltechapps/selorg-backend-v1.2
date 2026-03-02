const mongoose = require('mongoose');

const CycleCountItemSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    trim: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  expected: {
    type: Number,
    required: true,
    min: 0,
  },
  counted: {
    type: Number,
    required: true,
    min: 0,
  },
  discrepancy: {
    type: Number,
    required: true,
    description: 'Calculated as counted - expected',
  },
  location: {
    type: String,
    required: true,
    trim: true,
  },
}, { _id: false });

const CycleCountSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  countId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  zone: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  assignedTo: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  scheduledDate: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['scheduled', 'in-progress', 'completed'],
    default: 'scheduled',
    index: true,
  },
  itemsTotal: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  itemsCounted: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  discrepancies: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  items: {
    type: [CycleCountItemSchema],
    default: [],
  },
}, {
  timestamps: true,
  collection: 'cycle_counts',
});

// Indexes for performance
CycleCountSchema.index({ zone: 1, status: 1 });
CycleCountSchema.index({ assignedTo: 1, status: 1 });
CycleCountSchema.index({ scheduledDate: 1, status: 1 });


module.exports = mongoose.models.CycleCount || mongoose.model('CycleCount', CycleCountSchema);

