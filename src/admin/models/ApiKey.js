/**
 * API Key Management - keys for external integrations, service accounts
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const ApiKeySchema = new Schema({
  keyId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  keyHash: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  scopes: [{ type: String }],
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  lastUsed: { type: Date },
  expiresAt: { type: Date },
}, { timestamps: true });

ApiKeySchema.index({ keyId: 1 }, { unique: true });
ApiKeySchema.index({ status: 1 });

// Generate keyId and hash for new keys (plain key returned only on create)
ApiKeySchema.statics.generateKey = function () {
  const plain = `sk_${crypto.randomBytes(32).toString('hex')}`;
  const keyId = plain.slice(0, 12) + '...' + plain.slice(-4);
  const keyHash = crypto.createHash('sha256').update(plain).digest('hex');
  return { plain, keyId, keyHash };
};

module.exports = mongoose.models.ApiKey || mongoose.model('ApiKey', ApiKeySchema);
