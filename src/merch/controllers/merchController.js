const Campaign = require('../models/Campaign');
const StockConflict = require('../models/StockConflict');
const PromoUplift = require('../models/PromoUplift');
const PriceChange = require('../models/PriceChange');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// @desc    Create Stock Conflict
// @route   POST /api/v1/merch/overview/conflicts
// @access  Private
const createStockConflict = async (req, res, next) => {
  try {
    const conflict = await StockConflict.create(req.body);
    res.status(201).json({
      success: true,
      data: conflict
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create Promo Uplift Data
// @route   POST /api/v1/merch/overview/uplift
// @access  Private
const createPromoUplift = async (req, res, next) => {
  try {
    const uplift = await PromoUplift.create(req.body);
    res.status(201).json({
      success: true,
      data: uplift
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Merch Overview Stats
// @route   GET /api/v1/merch/overview/stats
// @access  Public
const getMerchStats = async (req, res, next) => {
  try {
    const activeCampaigns = await Campaign.countDocuments({ status: 'Active' });
    const endingSoon = await Campaign.countDocuments({ 
        status: 'Active',
    });
    
    const recentUplift = await PromoUplift.findOne().sort({ createdAt: -1 });
    
    const stockConflicts = await StockConflict.countDocuments({ status: 'Open' });
    const pendingPriceChanges = await PriceChange.countDocuments({ status: 'Pending' });

    res.status(200).json({
      success: true,
      data: {
        activeCampaigns: {
            value: activeCampaigns,
            trend: `${endingSoon} ending soon`,
            trendUp: true
        },
        promoUplift: {
            value: `+${recentUplift?.uplift || 22}%`,
            trend: "vs last month",
            trendUp: true
        },
        priceChanges: {
            value: pendingPriceChanges,
            subValue: "Pending",
            trend: "Needs approval",
            trendUp: false
        },
        stockConflicts: {
            value: stockConflicts,
            trend: "High Priority",
            trendUp: false
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Stock Conflicts
// @route   GET /api/v1/merch/overview/conflicts
// @access  Public
const getStockConflicts = async (req, res, next) => {
  try {
    const conflicts = await StockConflict.find().sort({ severity: 1 });
    res.status(200).json({
      success: true,
      count: conflicts.length,
      data: conflicts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Promo Uplift Data
// @route   GET /api/v1/merch/overview/uplift
// @access  Public
const getPromoUplift = async (req, res, next) => {
  try {
    const upliftData = await PromoUplift.find().sort({ createdAt: 1 });
    res.status(200).json({
      success: true,
      count: upliftData.length,
      data: upliftData
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get Price Changes
// @route   GET /api/v1/merch/overview/price-changes
// @access  Public
const getPriceChanges = async (req, res, next) => {
  try {
    const priceChanges = await PriceChange.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: priceChanges.length,
      data: priceChanges
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create Price Change
// @route   POST /api/v1/merch/overview/price-changes
// @access  Private
const createPriceChange = async (req, res, next) => {
  try {
    const priceChange = await PriceChange.create(req.body);
    res.status(201).json({
      success: true,
      data: priceChange
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all campaigns
// @route   GET /api/v1/merch/campaigns
// @access  Public
const getCampaigns = async (req, res, next) => {
  try {
    const { status, type, scope } = req.query;
    const query = {};

    // Normalize status: 'active' -> 'Active', 'scheduled' -> 'Scheduled'
    if (status) {
      const statusMap = { active: 'Active', scheduled: 'Scheduled', draft: 'Draft', paused: 'Paused', archived: 'Archived', ended: 'Ended', stopped: 'Stopped' };
      query.status = statusMap[status.toLowerCase()] || status;
    }
    if (type) query.type = type;
    if (scope) query.scope = scope;

    const campaigns = await Campaign.find(query).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single campaign
// @route   GET /api/v1/merch/campaigns/:id
// @access  Public
const getCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return next(new ErrorResponse(`Campaign not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new campaign
// @route   POST /api/v1/merch/campaigns
// @access  Private
const createCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.create(req.body);

    res.status(201).json({
      success: true,
      data: campaign
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update campaign
// @route   PUT /api/v1/merch/campaigns/:id
// @access  Private
const updateCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!campaign) {
      return next(new ErrorResponse(`Campaign not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete campaign
// @route   DELETE /api/v1/merch/campaigns/:id
// @access  Private
const deleteCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);

    if (!campaign) {
      return next(new ErrorResponse(`Campaign not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createStockConflict,
  createPromoUplift,
  getMerchStats,
  getStockConflicts,
  getPromoUplift,
  getPriceChanges,
  createPriceChange,
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
};
