const AnalyticsRecord = require('../models/AnalyticsRecord');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const merchInsightsService = require('../services/merchInsightsService');

// @desc    Get analytics summary
// @route   GET /api/v1/merch/analytics/summary
const getAnalyticsSummary = async (req, res, next) => {
  try {
    const { type, range } = req.query;
    const records = await merchInsightsService.getSummary(type || undefined, range || '30days');

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (err) {
    next(err);
  }
};

const getCampaignAnalytics = async (req, res, next) => {
  try {
    const { range } = req.query;
    const detail = await merchInsightsService.getCampaignDetail(req.params.entityId, range || '30days');
    res.status(200).json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
};

const exportAnalytics = async (req, res, next) => {
  try {
    const { reportType = 'full', range = '30days' } = req.body || {};
    const types = reportType === 'full' ? ['campaign', 'sku', 'regional'] : [reportType];
    const payload = {};
    for (const t of types) {
      payload[t] = await merchInsightsService.getSummary(t, range);
    }
    res.status(200).json({
      success: true,
      data: payload,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

const saveAnalyticsPreset = async (req, res, next) => {
  try {
    const { name, filters } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, error: 'Preset name is required' });
    }
    const record = await AnalyticsRecord.create({
      type: 'campaign',
      entityId: `preset-${Date.now()}`,
      entityName: name,
      metricDate: new Date().toISOString().slice(0, 10),
      metadata: { preset: true, filters },
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

// @desc    Create analytics record (Internal use or simulation)
// @route   POST /api/v1/analytics/records
// @access  Private
const createAnalyticsRecord = async (req, res, next) => {
  try {
    const record = await AnalyticsRecord.create(req.body);
    res.status(201).json({
      success: true,
      data: record
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Refresh analytics snapshot from live operational data (no mock rows)
// @route   POST /api/v1/analytics/seed
// @access  Private
const seedAnalyticsData = async (req, res, next) => {
  try {
    const range = req.body?.range || '30days';
    const records = await merchInsightsService.getSummary(undefined, range);

    res.status(200).json({
      success: true,
      message: 'Analytics computed from live campaigns, orders, SKUs, and zones',
      count: records.length,
      data: records,
    });
  } catch (err) {
    next(err);
  }
};


module.exports = {
  getAnalyticsSummary,
  getCampaignAnalytics,
  exportAnalytics,
  saveAnalyticsPreset,
  createAnalyticsRecord,
  seedAnalyticsData,
};
