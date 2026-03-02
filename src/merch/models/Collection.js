const mongoose = require('mongoose');
const { Schema } = mongoose;

const CollectionSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  type: { type: String, required: true, enum: ['Seasonal', 'Thematic', 'Bundle/Combo', 'Brand'] },
  status: { type: String, required: true, enum: ['Live', 'Draft', 'Scheduled', 'Archived'], default: 'Draft' },
  tags: [{ type: String }],
  skus: [{ type: Schema.Types.ObjectId, ref: 'SKU' }],
  imageUrl: { type: String },
  region: { type: String, required: true, default: 'North America' },
  owner: { type: String, required: true, default: 'Sarah J.' }
}, {
  timestamps: true
});

module.exports = mongoose.models.Collection || mongoose.model('Collection', CollectionSchema);
