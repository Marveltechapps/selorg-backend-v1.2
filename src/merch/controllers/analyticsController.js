const AnalyticsRecord = require('../models/AnalyticsRecord');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// @desc    Get analytics summary
// @route   GET /api/v1/analytics/summary
// @access  Public
const getAnalyticsSummary = async (req, res, next) => {
  try {
    const { type, range } = req.query;
    
    // In a real app, logic to handle date range (e.g. 7days, 30days)
    const query= {};
    if (type) query.type = type;

    const records = await AnalyticsRecord.find(query).sort({ metricDate: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
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

// @desc    Seed Analytics Data
// @route   POST /api/v1/analytics/seed
// @access  Private
const seedAnalyticsData = async (req, res, next) => {
  try {
    const mockRecords = [
      // Campaign Analytics
      {
        type: 'campaign',
        entityId: 'camp-001',
        entityName: 'Summer Essentials',
        metricDate: '2026-01-05',
        revenue: 45000,
        orders: 1200,
        uplift: 18.5,
        roi: 4.2
      },
      {
        type: 'campaign',
        entityId: 'camp-002',
        entityName: 'Weekend Flash Sale',
        metricDate: '2026-01-06',
        revenue: 12000,
        orders: 450,
        uplift: 25.0,
        roi: 6.8
      },
      // SKU Analytics
      {
        type: 'sku',
        entityId: 'sku-101',
        entityName: 'Organic Avocados',
        metricDate: '2026-01-07',
        revenue: 8500,
        orders: 2100,
        unitsSold: 2500
      },
      // Regional Analytics
      {
        type: 'regional',
        entityId: 'reg-001',
        entityName: 'Downtown Core',
        metricDate: '2026-01-07',
        revenue: 125000,
        orders: 5400,
        aov: 23.15,
        redemptionRate: 14.2
      }
    ];

    await AnalyticsRecord.deleteMany({});
    const records = await AnalyticsRecord.insertMany(mockRecords);

    res.status(201).json({
      success: true,
      message: 'Analytics data seeded successfully',
      count: records.length
    });
  } catch (err) {
    next(err);
  }
};


module.exports = {
  getAnalyticsSummary,
  createAnalyticsRecord,
  seedAnalyticsData
};
