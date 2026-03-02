const mongoose = require('mongoose');

const pickerSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: false,
      enum: ['available', 'busy', 'break'],
      default: 'available',
    },
    zone_expertise: {
      type: [String],
      required: false,
      enum: ['Ambient A', 'Ambient B', 'Chiller', 'Frozen'],
    },
    current_picklists: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

pickerSchema.index({ id: 1 });
pickerSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.Picker || mongoose.model('Picker', pickerSchema);

