'use strict';

const mongoose = require('mongoose');

const logisticsProviderConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 100, index: true },
    apiBaseUrl: { type: String },
    /** Encrypted JSON string (AES-256-GCM); never log decrypted value */
    credentialsEncrypted: { type: String, default: '' },
    vehicleTypeMapping: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

logisticsProviderConfigSchema.index({ isActive: 1, priority: 1 });

module.exports =
  mongoose.models.LogisticsProviderConfig ||
  mongoose.model('LogisticsProviderConfig', logisticsProviderConfigSchema);
