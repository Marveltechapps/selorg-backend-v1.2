'use strict';

const { asyncHandler } = require('../../core/middleware');
const { LogisticsError } = require('../utils/errors');
const providerConfig = require('../services/providerConfig.service');
const analytics = require('../services/logisticsAnalytics.service');

const listProviders = asyncHandler(async (_req, res) => {
  const data = await providerConfig.listConfigs();
  res.json({ success: true, data });
});

const patchProvider = asyncHandler(async (req, res) => {
  const patch = {};
  if (typeof req.validatedBody.isActive === 'boolean') patch.isActive = req.validatedBody.isActive;
  if (typeof req.validatedBody.priority === 'number') patch.priority = req.validatedBody.priority;
  const data = await providerConfig.updateConfig(req.validatedParams.id, patch);
  if (!data) {
    throw new LogisticsError('Provider config not found', 404, 'NOT_FOUND');
  }
  res.json({ success: true, data });
});

const reorderProvider = asyncHandler(async (req, res) => {
  const data = await providerConfig.reorderConfig(
    req.validatedParams.id,
    req.validatedBody.direction
  );
  if (!data) {
    throw new LogisticsError('Provider config not found', 404, 'NOT_FOUND');
  }
  res.json({ success: true, data });
});

const costPerRoute = asyncHandler(async (req, res) => {
  const data = await analytics.costPerRoute(req.validatedQuery.from, req.validatedQuery.to);
  res.json({ success: true, data });
});

const slaBreaches = asyncHandler(async (_req, res) => {
  const data = await analytics.slaBreaches();
  res.json({ success: true, data });
});

const kpis = asyncHandler(async (_req, res) => {
  const data = await analytics.dashboardKpis();
  res.json({ success: true, data });
});

module.exports = {
  listProviders,
  patchProvider,
  reorderProvider,
  costPerRoute,
  slaBreaches,
  kpis,
};
