const mongoose = require('mongoose');

const shelfActivitySchema = new mongoose.Schema(
  {
    shelf_id: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    timestamp: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

shelfActivitySchema.index({ shelf_id: 1, createdAt: -1 });

module.exports = mongoose.models.ShelfActivity || mongoose.model('ShelfActivity', shelfActivitySchema);

