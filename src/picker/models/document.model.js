/**
 * Document model – from frontend YAML (DocumentUploads, DocumentUploadResponse).
 * userId, docType (aadhar|pan), side (front|back), url.
 */
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    docType: { type: String, enum: ['aadhar', 'pan'], required: true },
    side: { type: String, enum: ['front', 'back'], required: true },
    url: { type: String, required: true },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, docType: 1, side: 1 }, { unique: true });

// Use PickerDocument to avoid conflict with rider/models/Document.js
module.exports = mongoose.models.PickerDocument || mongoose.model('PickerDocument', documentSchema, 'picker_documents');
