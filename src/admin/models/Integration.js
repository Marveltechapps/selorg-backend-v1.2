/**
 * Third-party Integration configuration
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const IntegrationSchema = new Schema({
  name: { type: String, required: true },
  service: { type: String, required: true },
  apiKey: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  endpoint: { type: String },
  lastSync: { type: Date },
}, { timestamps: true });

module.exports = mongoose.models.Integration || mongoose.model('Integration', IntegrationSchema);
