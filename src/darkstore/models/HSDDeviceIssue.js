const mongoose = require('mongoose');

const hsdDeviceIssueSchema = new mongoose.Schema(
  {
    ticket_id: {
      type: String,
      required: true,
      unique: true,
    },
    device_id: {
      type: String,
      required: true,
    },
    issue_type: {
      type: String,
      required: true,
      enum: ['hardware', 'software', 'connectivity'],
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    reported_by: {
      type: String,
      required: false,
    },
    reported_at: {
      type: String,
      required: true,
    },
    resolved_at: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

hsdDeviceIssueSchema.index({ ticket_id: 1 });
hsdDeviceIssueSchema.index({ device_id: 1 });
hsdDeviceIssueSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.HSDDeviceIssue || mongoose.model('HSDDeviceIssue', hsdDeviceIssueSchema);

