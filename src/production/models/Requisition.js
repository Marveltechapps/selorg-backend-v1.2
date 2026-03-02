const mongoose = require('mongoose');

const requisitionSchema = new mongoose.Schema(
  {
    reqNumber: { type: String, required: true },
    material: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    requestedBy: { type: String, required: true },
    line: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'issued', 'rejected'], default: 'pending' },
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
  },
  { timestamps: true }
);

requisitionSchema.index({ status: 1 });
requisitionSchema.index({ reqNumber: 1 });

module.exports = mongoose.models.Requisition || mongoose.model('Requisition', requisitionSchema, 'prod_requisitions');
