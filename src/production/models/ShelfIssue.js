const mongoose = require('mongoose');

const shelfIssueSchema = new mongoose.Schema(
  {
    shelf_id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['count_mismatch'],
    },
    message: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['critical', 'warning', 'info'],
      default: 'warning',
    },
  },
  {
    timestamps: true,
  }
);

shelfIssueSchema.index({ shelf_id: 1 });
shelfIssueSchema.index({ severity: 1 });

module.exports = mongoose.models.ShelfIssue || mongoose.model('ShelfIssue', shelfIssueSchema);

