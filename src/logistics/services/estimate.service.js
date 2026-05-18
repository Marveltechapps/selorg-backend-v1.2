'use strict';

const LogisticsProviderConfig = require('../models/logisticsProviderConfig.model');
const { getProviderAdapter } = require('../factory/providerFactory');
const providerConfig = require('./providerConfig.service');
const logger = require('../utils/logger');

async function multiEstimate(body) {
  await providerConfig.ensureDefaultConfigs();
  const requested = body.providers;
  let names = await LogisticsProviderConfig.find({ isActive: true }).sort({ priority: 1 }).select('name').lean();
  names = names.map((n) => n.name);
  if (requested && requested.length) {
    names = names.filter((n) => requested.includes(n));
  }
  const results = [];
  for (const name of names) {
    try {
      const adapter = getProviderAdapter(name);
      const est = await adapter.getFareEstimate(body);
      results.push({ provider: name, ok: true, fare: est.fare, distanceKm: est.distanceKm, raw: est.raw });
    } catch (e) {
      logger.warn('[estimate] provider failed', { name, error: e.message });
      results.push({ provider: name, ok: false, error: e.message });
    }
  }
  return { results };
}

module.exports = { multiEstimate };
