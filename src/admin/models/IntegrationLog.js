/**
 * Integration Request Log - tracks API calls to external integrations
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const IntegrationLogSchema = new Schema({
  integrationId: { type: Schema.Types.ObjectId, ref: 'Integration', required: true },
  method: { type: String, required: true },
  endpoint: { type: String, required: true },
  statusCode: { type: Number, required: true },
  responseTime: { type: Number, default: 0 },
  requestSize: { type: Number, default: 0 },
  responseSize: { type: Number, default: 0 },
  success: { type: Boolean, default: true },
  errorMessage: { type: String },
}, { timestamps: true });

IntegrationLogSchema.index({ integrationId: 1 });
IntegrationLogSchema.index({ createdAt: -1 });
IntegrationLogSchema.index({ success: 1 });

module.exports = mongoose.models.IntegrationLog || mongoose.model('IntegrationLog', IntegrationLogSchema);
