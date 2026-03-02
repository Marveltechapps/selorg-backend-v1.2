const mongoose = require('mongoose');

const vendorContractSchema = new mongoose.Schema(
  {
    contract_id: {
      type: String,
      required: true,
      unique: true,
    },
    vendor_id: {
      type: String,
      required: true,
    },
    vendor_name: {
      type: String,
      required: true,
    },
    contract_number: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['Service', 'Supply', 'Maintenance', 'Other'],
      default: 'Supply',
    },
    start_date: {
      type: String,
      required: true,
    },
    end_date: {
      type: String,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'pending', 'terminated'],
      default: 'pending',
    },
    renewal_date: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

vendorContractSchema.index({ contract_id: 1 });
vendorContractSchema.index({ vendor_id: 1 });
vendorContractSchema.index({ status: 1 });
vendorContractSchema.index({ contract_number: 1 });

module.exports =
  mongoose.models.VendorContract || mongoose.model('VendorContract', vendorContractSchema);
