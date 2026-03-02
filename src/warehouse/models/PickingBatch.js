const mongoose = require('mongoose');

const PickingBatchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  zone: { type: String, required: true },
  pickerId: { type: String },
  orders: [{ type: String }], // Array of Picklist IDs or Order IDs
  itemCount: { type: Number, default: 0 },
  startTime: { type: Date },
  endTime: { type: Date }
}, { timestamps: true, collection: 'warehouse_picking_batches' });

module.exports = mongoose.models.PickingBatch || mongoose.model('PickingBatch', PickingBatchSchema);

