const mongoose = require('mongoose');

const autoQCCheckSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
    },
    check_name: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: false,
      enum: ['passed', 'failed', 'pending'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

autoQCCheckSchema.index({ order_id: 1 });

module.exports = mongoose.models.AutoQCCheck || mongoose.model('AutoQCCheck', autoQCCheckSchema);

