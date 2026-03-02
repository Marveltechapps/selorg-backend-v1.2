const mongoose = require('mongoose');

const picklistOrderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
    },
    picklist_id: {
      type: String,
      required: true,
    },
    item_count: {
      type: Number,
      required: false,
      default: 0,
    },
    customer_name: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

picklistOrderSchema.index({ picklist_id: 1 });
picklistOrderSchema.index({ order_id: 1 });

module.exports = mongoose.models.PicklistOrder || mongoose.model('PicklistOrder', picklistOrderSchema);

