/**
 * Shared attachment subdocument for support tickets and messages.
 */
const mongoose = require('mongoose');

const supportAttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    sizeBytes: { type: Number, default: 0 },
  },
  { _id: false }
);

module.exports = { supportAttachmentSchema };
