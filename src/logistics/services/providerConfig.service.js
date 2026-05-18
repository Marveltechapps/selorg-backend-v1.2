'use strict';

const LogisticsProviderConfig = require('../models/logisticsProviderConfig.model');
const { getConfig } = require('../config/env');
const { encryptJson } = require('../utils/cryptoSecrets');
const logger = require('../utils/logger');

async function ensureDefaultConfigs() {
  const n = await LogisticsProviderConfig.estimatedDocumentCount();
  if (n > 0) return;
  const cfg = getConfig();
  try {
    await LogisticsProviderConfig.insertMany([
      {
        name: 'PORTER',
        isActive: true,
        priority: 10,
        apiBaseUrl: cfg.PORTER_API_BASE_URL,
        credentialsEncrypted: '',
        vehicleTypeMapping: { default: 'mini_truck' },
      },
      {
        name: 'SHADOWFAX',
        isActive: false,
        priority: 20,
        apiBaseUrl: 'https://api.shadowfax.in',
        credentialsEncrypted: '',
        vehicleTypeMapping: {},
      },
    ]);
    logger.info('[logistics] seeded default LogisticsProviderConfig');
  } catch (err) {
    logger.warn('[logistics] seed configs skipped', { error: err.message });
  }
}

async function listConfigs() {
  await ensureDefaultConfigs();
  return LogisticsProviderConfig.find().sort({ priority: 1 }).lean();
}

async function updateConfig(id, patch) {
  return LogisticsProviderConfig.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
}

function encryptCredentialsIfKeyPresent(obj) {
  const key = process.env.LOGISTICS_CRED_ENCRYPTION_KEY;
  if (!key || !obj) return '';
  return encryptJson(obj, key);
}

module.exports = {
  ensureDefaultConfigs,
  listConfigs,
  updateConfig,
  encryptCredentialsIfKeyPresent,
};
