'use strict';

const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    signature: { type: String, default: '' },
    processed: { type: Boolean, default: false, index: true },
    processingError: { type: String },
  },
  { timestamps: true }
);

webhookEventSchema.index({ processed: 1, createdAt: 1 });

module.exports =
  mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', webhookEventSchema);
