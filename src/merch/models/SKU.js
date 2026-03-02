const mongoose = require('mongoose');
const { Schema } = mongoose;

const SKUSchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  brand: { type: String, required: true },
  cost: { type: Number, default: 0 },
  basePrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  competitorAvg: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  marginStatus: { type: String, enum: ['healthy', 'warning', 'critical'], default: 'healthy' },
  stock: { type: Number, default: 0 },
  visibility: {
    'North America': { type: String, enum: ['Visible', 'Hidden'], default: 'Hidden' },
    'Europe (West)': { type: String, enum: ['Visible', 'Hidden'], default: 'Hidden' },
    'APAC': { type: String, enum: ['Visible', 'Hidden'], default: 'Hidden' }
  },
  imageUrl: { type: String },
  tags: [{ type: String }],
  history: [{
    date: String,
    price: Number,
    competitor: Number
  }]
}, {
  timestamps: true
});

// Indexes for performance
SKUSchema.index({ code: 1 }); // Already unique, but explicit index
SKUSchema.index({ category: 1, marginStatus: 1 });
SKUSchema.index({ stock: 1 });
SKUSchema.index({ name: 'text', code: 'text' }); // Text search

module.exports = mongoose.models.SKU || mongoose.model('SKU', SKUSchema);
