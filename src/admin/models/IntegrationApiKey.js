/**
 * Integration API Key - per-integration keys for external services
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const IntegrationApiKeySchema = new Schema({
  integrationId: { type: Schema.Types.ObjectId, ref: 'Integration', required: true },
  name: { type: String, required: true },
  keyPrefix: { type: String }, // first 8 chars for display
  keyHash: { type: String, required: true },
  environment: { type: String, enum: ['production', 'sandbox'], default: 'production' },
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
  permissions: [{ type: String }],
  lastUsed: { type: Date },
  expiresAt: { type: Date },
  usageCount: { type: Number, default: 0 },
}, { timestamps: true });

IntegrationApiKeySchema.index({ integrationId: 1 });
IntegrationApiKeySchema.index({ status: 1 });

IntegrationApiKeySchema.statics.generateKey = function () {
  const plain = `sk_${crypto.randomBytes(24).toString('hex')}`;
  const keyPrefix = plain.slice(0, 12) + '••••••••';
  const keyHash = crypto.createHash('sha256').update(plain).digest('hex');
  return { plain, keyPrefix, keyHash };
};

module.exports = mongoose.models.IntegrationApiKey || mongoose.model('IntegrationApiKey', IntegrationApiKeySchema);
