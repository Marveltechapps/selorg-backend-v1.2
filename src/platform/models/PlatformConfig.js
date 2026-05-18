const mongoose = require('mongoose');

const platformConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 256,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    valueType: {
      type: String,
      enum: ['string', 'number', 'boolean', 'json'],
      default: 'string',
    },
    description: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    updatedBy: {
      type: String,
      default: '',
    },
  },
  { timestamps: true, collection: 'platform_configs' }
);

platformConfigSchema.index({ key: 1 }, { unique: true });

const PlatformConfig =
  mongoose.models.PlatformConfig ||
  mongoose.model('PlatformConfig', platformConfigSchema);

module.exports = PlatformConfig;
