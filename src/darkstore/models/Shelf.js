const mongoose = require('mongoose');

const shelfSchema = new mongoose.Schema(
  {
    shelf_id: {
      type: String,
      required: true,
      unique: true,
    },
    location_code: {
      type: String,
      required: true,
    },
    aisle: {
      type: String,
      required: true,
      enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
    shelf_number: {
      type: Number,
      required: true,
    },
    zone: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['normal', 'critical', 'misplaced'],
      default: 'normal',
    },
    is_critical: {
      type: Boolean,
      required: true,
      default: false,
    },
    is_misplaced: {
      type: Boolean,
      required: true,
      default: false,
    },
    store_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

shelfSchema.index({ store_id: 1, zone: 1 });
shelfSchema.index({ location_code: 1 });
shelfSchema.index({ aisle: 1, shelf_number: 1 });

module.exports = mongoose.models.Shelf || mongoose.model('Shelf', shelfSchema);

