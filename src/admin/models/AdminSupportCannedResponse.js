/**
 * AdminSupportCannedResponse – Quick reply templates.
 */
const mongoose = require('mongoose');

const adminSupportCannedResponseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, required: true },
    content: { type: String, required: true },
    tags: [{ type: String }],
    usageCount: { type: Number, default: 0 },
    createdBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminSupportCannedResponse', adminSupportCannedResponseSchema);
