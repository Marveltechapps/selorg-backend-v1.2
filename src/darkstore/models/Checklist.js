const mongoose = require('mongoose');

const checklistSchema = new mongoose.Schema(
  {
    checklist_id: {
      type: String,
      required: true,
      unique: true,
    },
    checklist_type: {
      type: String,
      required: true,
      enum: ['opening', 'closing', 'hygiene'],
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: 'in_progress',
    },
    progress: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    total_items: {
      type: Number,
      required: true,
      default: 0,
    },
    completed_items: {
      type: Number,
      required: true,
      default: 0,
    },
    submitted_by: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
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

checklistSchema.index({ store_id: 1, checklist_type: 1, date: -1 });
checklistSchema.index({ checklist_id: 1 });

module.exports = mongoose.models.Checklist || mongoose.model('Checklist', checklistSchema);

