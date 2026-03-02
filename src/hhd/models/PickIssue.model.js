const mongoose = require('mongoose');
const { PICK_ISSUE_TYPE } = require('../utils/constants');

const PickIssueSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: [true, 'Please add an order ID'], index: true },
    sku: { type: String, required: [true, 'Please add a SKU'], index: true },
    binId: { type: String, required: [true, 'Please add a bin ID'], index: true },
    issueType: {
      type: String,
      enum: Object.values(PICK_ISSUE_TYPE),
      required: [true, 'Please add an issue type'],
      index: true,
    },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HHDUser', required: true, index: true },
    deviceId: { type: String, index: true },
    notes: { type: String },
  },
  { timestamps: true, collection: 'hhd_pick_issues' }
);

PickIssueSchema.index({ orderId: 1, sku: 1 });
PickIssueSchema.index({ issueType: 1, createdAt: -1 });
PickIssueSchema.index({ binId: 1 });

module.exports = mongoose.model('HHDPickIssue', PickIssueSchema);
