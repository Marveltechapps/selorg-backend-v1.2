const mongoose = require('mongoose');

const picklistItemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: false,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    location: {
      type: String,
      required: false,
    },
    picklist_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

picklistItemSchema.index({ picklist_id: 1 });
picklistItemSchema.index({ sku: 1 });

module.exports = mongoose.models.PicklistItem || mongoose.model('PicklistItem', picklistItemSchema);

