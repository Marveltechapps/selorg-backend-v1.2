const mongoose = require('mongoose');

const bulkUploadSchema = new mongoose.Schema(
  {
    upload_id: {
      type: String,
      required: true,
      unique: true,
    },
    store_id: {
      type: String,
      required: true,
    },
    file_name: {
      type: String,
      required: true,
    },
    total_rows: {
      type: Number,
      required: true,
    },
    processed_rows: {
      type: Number,
      default: 0,
    },
    failed_rows: {
      type: Number,
      default: 0,
    },
    errorLogs: {
      type: [
        {
          row: {
            type: Number,
            required: true,
          },
          error: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    validate_only: {
      type: Boolean,
      default: false,
    },
    created_at: {
      type: String,
      required: true,
    },
    completed_at: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: false,
  }
);

bulkUploadSchema.index({ upload_id: 1 });
bulkUploadSchema.index({ store_id: 1, created_at: -1 });

module.exports = mongoose.models.BulkUpload || mongoose.model('BulkUpload', bulkUploadSchema);

