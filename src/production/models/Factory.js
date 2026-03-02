const mongoose = require('mongoose');

const factorySchema = new mongoose.Schema(
  {
    factory_id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['operational', 'maintenance'],
      default: 'operational',
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

factorySchema.index({ factory_id: 1 });
factorySchema.index({ status: 1 });

module.exports = mongoose.models.Factory || mongoose.model('Factory', factorySchema);
