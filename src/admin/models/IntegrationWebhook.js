/**
 * Integration Webhook - event-driven endpoints for third-party integrations
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const IntegrationWebhookSchema = new Schema({
  integrationId: { type: Schema.Types.ObjectId, ref: 'Integration', required: true },
  event: { type: String, required: true },
  url: { type: String, required: true },
  method: { type: String, enum: ['POST', 'GET', 'PUT'], default: 'POST' },
  status: { type: String, enum: ['active', 'inactive', 'failed'], default: 'active' },
  headers: { type: Map, of: String, default: {} },
  lastTriggered: { type: Date },
  totalCalls: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  retryPolicy: { type: String, default: '3 retries with exponential backoff' },
}, { timestamps: true });

IntegrationWebhookSchema.index({ integrationId: 1 });
IntegrationWebhookSchema.index({ event: 1 });

module.exports = mongoose.models.IntegrationWebhook || mongoose.model('IntegrationWebhook', IntegrationWebhookSchema);
