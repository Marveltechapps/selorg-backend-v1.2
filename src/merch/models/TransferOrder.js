const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransferOrderSchema = new Schema({
  skuId: { type: String, required: true },
  skuName: { type: String, required: true },
  fromLocation: { type: String, required: true },
  toLocation: { type: String, required: true },
  quantity: { type: Number, required: true },
  requiredDate: { type: String },
  status: { type: String, enum: ['pending', 'in_transit', 'completed', 'cancelled'], default: 'pending' },
}, {
  timestamps: true
});

module.exports = mongoose.models.TransferOrder || mongoose.model('TransferOrder', TransferOrderSchema);
