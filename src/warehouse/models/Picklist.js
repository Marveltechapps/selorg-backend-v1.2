const mongoose = require('mongoose');

const PicklistSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  orderId: { type: String, required: true },
  customer: { type: String, required: true },
  items: { type: Number, required: true },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  status: { type: String, enum: ['queued', 'assigned', 'picking', 'completed'], default: 'queued' },
  picker: { type: String },
  pickerId: { type: String, index: true },
  zone: { type: String }
}, { timestamps: true, collection: 'warehouse_picklists' });

PicklistSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

// Unique model name — darkstore/production also register `Picklist` on the shared connection.
module.exports =
  mongoose.models.WarehousePicklist ||
  mongoose.model('WarehousePicklist', PicklistSchema);

