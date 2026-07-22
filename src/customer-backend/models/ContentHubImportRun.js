const mongoose = require('mongoose');

const sheetIssueSchema = new mongoose.Schema(
  {
    sheet: { type: String, default: '' },
    row: { type: Number, default: null },
    sku: { type: String, default: '' },
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

    /** queued | running | completed | failed */
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    /** 0–100 real progress while running */
    progress: { type: Number, default: 0, min: 0, max: 100 },
    /** Current stage key, e.g. parsing | categories | products | inventory | banners | images | homepage | done */
    stage: { type: String, default: 'queued' },
    stageMessage: { type: String, default: '' },
    /** Per-stage elapsed ms: { parsing, categories, products, inventory, banners, images, homepage, total } */
    stageTimings: { type: mongoose.Schema.Types.Mixed, default: {} },

    success: { type: Boolean, default: false, index: true },
    durationMs: { type: Number, default: 0 },

    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    warnings: { type: [sheetIssueSchema], default: [] },
    importErrors: { type: [sheetIssueSchema], default: [] },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contentHubImportRunSchema.index({ createdAt: -1 });
contentHubImportRunSchema.index({ status: 1, createdAt: -1 });

const ContentHubImportRun =
  mongoose.models.ContentHubImportRun ||
  mongoose.model('ContentHubImportRun', contentHubImportRunSchema, 'content_hub_import_runs');

module.exports = { ContentHubImportRun };
