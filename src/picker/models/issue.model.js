/**
 * Picker Issue model – issues reported by pickers (item damaged, inventory mismatch, etc.)
 * Collection: picker_issues
 */
const mongoose = require('mongoose');

const ISSUE_TYPE = [
  'item_damaged',
  'inventory_mismatch',
  'shelf_empty',
  'app_bug',
  'device_issue',
];

const ISSUE_STATUS = ['open', 'assigned', 'closed'];

const SEVERITY = ['low', 'medium', 'high'];

const issueSchema = new mongoose.Schema(
  {
    pickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true },
    issueType: { type: String, enum: ISSUE_TYPE, required: true },
    orderId: { type: String },
    description: { type: String, required: true },
    imageUrl: { type: String },
    reportedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ISSUE_STATUS, default: 'open' },
    assignedTo: { type: String },
    closedAt: { type: Date },
    severity: { type: String, enum: SEVERITY },
    storeId: { type: String },
  },
  { timestamps: true, collection: 'picker_issues' }
);

issueSchema.index({ pickerId: 1, reportedAt: -1 });
issueSchema.index({ status: 1, storeId: 1, reportedAt: -1 });
issueSchema.index({ storeId: 1, severity: 1, status: 1 });

module.exports =
  mongoose.models.PickerIssue ||
  mongoose.model('PickerIssue', issueSchema, 'picker_issues');
