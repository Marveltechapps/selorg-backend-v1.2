const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema(
  {
    item_id: {
      type: String,
      required: true,
      unique: true,
    },
    checklist_id: {
      type: String,
      required: true,
    },
    task: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: 'unchecked',
    },
    completed_at: {
      type: Date,
      required: false,
    },
    completed_by: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

checklistItemSchema.index({ checklist_id: 1 });
checklistItemSchema.index({ item_id: 1 });

module.exports = mongoose.models.ChecklistItem || mongoose.model('ChecklistItem', checklistItemSchema);

