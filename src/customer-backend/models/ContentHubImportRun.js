const mongoose = require('mongoose');

const sheetIssueSchema = new mongoose.Schema(
  {
    sheet: { type: String, default: '' },
    row: { type: Number, default: null },
    message: { type: String, default: '' },
  },
  { _id: false }
);

const contentHubImportRunSchema = new mongoose.Schema(
  {
    source: { type: String, default: 'content-hub', index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', default: null, index: true },

    file: {
      originalName: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      sizeBytes: { type: Number, default: 0 },
    },

    overwrite: { type: Boolean, default: true },
    success: { type: Boolean, default: false, index: true },
    durationMs: { type: Number, default: 0 },

    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    warnings: { type: [sheetIssueSchema], default: [] },
    errors: { type: [sheetIssueSchema], default: [] },
  },
  { timestamps: true }
);

contentHubImportRunSchema.index({ createdAt: -1 });

const ContentHubImportRun =
  mongoose.models.ContentHubImportRun ||
  mongoose.model('ContentHubImportRun', contentHubImportRunSchema, 'content_hub_import_runs');

module.exports = { ContentHubImportRun };

