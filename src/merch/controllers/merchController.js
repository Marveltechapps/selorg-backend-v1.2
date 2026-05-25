const Campaign = require('../models/Campaign');
const StockConflict = require('../models/StockConflict');
const PromoUplift = require('../models/PromoUplift');
const PriceChange = require('../models/PriceChange');
const AnalyticsRecord = require('../models/AnalyticsRecord');
const SKU = require('../models/SKU');
const ErrorResponse = require('../../core/utils/ErrorResponse');

const formatInrShort = (amount) => {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₹${Math.round(n / 1_000)}k`;
  return `₹${Math.round(n)}`;
};

const parseKpiPercent = (kpiValue) => {
  if (!kpiValue || typeof kpiValue !== 'string') return null;
  const m = kpiValue.match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
};

const normalizeCampaignSkuObjects = async (inputSkus = []) => {
  if (!Array.isArray(inputSkus) || inputSkus.length === 0) return [];

  const skuIds = inputSkus
    .filter((s) => typeof s === 'string' || typeof s === 'number')
    .map((s) => String(s))
    .filter(Boolean);

  let skuById = new Map();
  if (skuIds.length > 0) {
    const docs = await SKU.find({ _id: { $in: skuIds } }).lean();
    skuById = new Map(docs.map((d) => [String(d._id), d]));
  }

  return inputSkus
    .map((sku) => {
      if (typeof sku === 'string' || typeof sku === 'number') {
        const id = String(sku);
        const doc = skuById.get(id);
        return {
          sku: doc?.code || id,
          name: doc?.name || id,
          category: doc?.category || 'General',
          basePrice: Number(doc?.basePrice ?? 0),
          promoPrice: Number(doc?.sellingPrice ?? doc?.basePrice ?? 0),
        };
      }
      if (!sku || typeof sku !== 'object') return null;
      return {
        sku: String(sku.sku || sku.code || sku.id || sku._id || ''),
        name: String(sku.name || sku.sku || sku.code || 'Unknown SKU'),
        category: String(sku.category || 'General'),
        basePrice: Number(sku.basePrice ?? sku.base ?? 0),
        promoPrice: Number(sku.promoPrice ?? sku.sell ?? sku.sellingPrice ?? sku.basePrice ?? 0),
      };
    })
    .filter((s) => s && s.sku);
};

const REGION_LABEL_TO_CODE = {
  'north america': 'na',
  na: 'na',
  europe: 'eu',
  eu: 'eu',
  apac: 'all',
  all: 'all',
};

const mapRegionCode = (region) => {
  if (!region) return 'na';
  const key = String(region).toLowerCase().trim();
  return REGION_LABEL_TO_CODE[key] || (key.length <= 3 ? key : 'na');
};

const capitalizeCampaignType = (type) => {
  const raw = String(type || 'discount').trim();
  if (!raw) return 'Discount';
  return raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const buildDiscountLogic = (body) => {
  if (body.rules?.discountLogic) return body.rules.discountLogic;
  const val = body.discountValue ?? body.rules?.discountValue;
  if (val == null || val === '') return 'Flat 20% Off';
  const dtype = String(body.discountType || 'percentage').toLowerCase();
  if (dtype === 'flat') return `Flat ₹${val} Off`;
  if (dtype === 'bogo') return 'Buy One Get One';
  if (dtype === 'tiered') return `Tiered ${val}% Off`;
  return `${val}% Off`;
};

const normalizeCampaignPayload = async (body, { isPartial = false } = {}) => {
  const payload = { ...body };
  if (!isPartial) {
    payload.name = payload.name || 'Untitled Campaign';
    payload.tagline = payload.tagline || payload.description || 'Campaign';
    payload.period = payload.period || 'TBD';
    payload.target = payload.target || 'Selected SKUs';
    payload.scope = payload.scope || payload.region || 'Global';
    payload.type = capitalizeCampaignType(payload.type);
    payload.owner = payload.owner || { name: 'System', initial: 'S' };
    if (!payload.status) payload.status = 'Draft';
  }
  if (payload.endDate && !payload.endsAt) {
    payload.endsAt = new Date(payload.endDate);
  }
  if (payload.region != null && payload.region.length > 3) {
    payload.region = mapRegionCode(payload.region);
  } else if (payload.region == null && !isPartial) {
    payload.region = mapRegionCode(payload.scope);
  }
  if (!payload.channel && !isPartial) payload.channel = 'all';
  if (!payload.campaignCategory && !isPartial) {
    const t = String(payload.type || '').toLowerCase();
    payload.campaignCategory = t.includes('clearance') ? 'clearance' : 'promo';
  }
  if (payload.skus != null) {
    payload.skus = await normalizeCampaignSkuObjects(payload.skus);
  }
  if (payload.discountValue != null || payload.discountType != null || payload.minOrderValue != null) {
    payload.rules = {
      discountLogic: buildDiscountLogic(payload),
      minOrder: payload.minOrderValue != null && payload.minOrderValue !== ''
        ? `₹${payload.minOrderValue}`
        : (payload.rules?.minOrder || '$0.00'),
      segment: payload.rules?.segment || 'All Customers',
      stackable: payload.rules?.stackable ?? false,
    };
    const depth = Number(payload.discountValue);
    if (!Number.isNaN(depth) && depth > 0) {
      payload.performance = {
        ...(payload.performance || {}),
        discountDepth: depth,
      };
    }
  }
  delete payload.description;
  delete payload.endDate;
  delete payload.discountType;
  delete payload.discountValue;
  delete payload.minOrderValue;
  return payload;
};

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
    const now = new Date();
    const endingWindowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const endingSoon = await Campaign.countDocuments({
      status: 'Active',
      endsAt: { $gte: now, $lte: endingWindowEnd },
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

// @desc    Seed overview demo data (campaigns, uplift, conflicts, price changes)
// @route   POST /api/v1/merch/overview/seed
// @access  Private
const seedOverviewData = async (req, res, next) => {
  try {
    await Promise.all([
      Campaign.deleteMany({}),
      StockConflict.deleteMany({}),
      PromoUplift.deleteMany({}),
      PriceChange.deleteMany({}),
    ]);

    const now = new Date();
    const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const in45Days = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

    const campaigns = await Campaign.insertMany([
      {
        name: 'Summer Essentials',
        tagline: 'Beat the heat with cold beverages',
        status: 'Active',
        period: 'May 1 – May 31',
        endsAt: in2Days,
        target: 'Beverages, Snacks',
        scope: 'chennai-hub',
        type: 'Discount',
        region: 'na',
        channel: 'online',
        campaignCategory: 'promo',
        owner: { name: 'Sarah Miller', initial: 'SM' },
        kpi: { label: 'Revenue Uplift', value: '+18%', trend: 'up' },
        performance: { revenue: 450000, uplift: 18.5, roi: 4.2, discountDepth: 20, orders: 1200 },
        skus: [],
      },
      {
        name: 'Weekend Flash Sale',
        tagline: '48-hour doorbuster deals',
        status: 'Active',
        period: 'May 10 – May 12',
        endsAt: in14Days,
        target: 'Grocery, Personal Care',
        scope: 'chennai-hub',
        type: 'Flash Sale',
        region: 'na',
        channel: 'all',
        campaignCategory: 'promo',
        owner: { name: 'Raj Kumar', initial: 'RK' },
        kpi: { label: 'Revenue Uplift', value: '+24%', trend: 'up' },
        performance: { revenue: 320000, uplift: 24, roi: 6.8, discountDepth: 25, orders: 890 },
        skus: [],
      },
      {
        name: 'Back to School',
        tagline: 'Stationery & snacks bundle',
        status: 'Scheduled',
        period: 'Jun 1 – Jun 30',
        endsAt: in45Days,
        target: 'Snacks, Stationery',
        scope: 'Global',
        type: 'Bundle',
        region: 'eu',
        channel: 'store',
        campaignCategory: 'promo',
        owner: { name: 'Priya Nair', initial: 'PN' },
        kpi: { label: 'Revenue Uplift', value: '+12%', trend: 'up' },
        performance: { revenue: 180000, uplift: 12, roi: 3.1, discountDepth: 15, orders: 420 },
        skus: [],
      },
      {
        name: 'Beverage Bundle BOGO',
        tagline: 'Buy one get one on select SKUs',
        status: 'Active',
        period: 'Apr 15 – May 15',
        endsAt: in14Days,
        target: 'Beverages',
        scope: 'chennai-hub',
        type: 'BOGO',
        region: 'na',
        channel: 'online',
        campaignCategory: 'clearance',
        owner: { name: 'Sarah Miller', initial: 'SM' },
        kpi: { label: 'Revenue Uplift', value: '+9%', trend: 'up' },
        performance: { revenue: 95000, uplift: 9, roi: 2.4, discountDepth: 35, orders: 310 },
        skus: [],
      },
      {
        name: 'End of Season Clearance',
        tagline: 'Deep discounts on seasonal inventory',
        status: 'Active',
        period: 'May 1 – May 20',
        endsAt: in14Days,
        target: 'Apparel, Home',
        scope: 'europe-west',
        type: 'Clearance',
        region: 'eu',
        channel: 'all',
        campaignCategory: 'clearance',
        owner: { name: 'James Cole', initial: 'JC' },
        kpi: { label: 'Revenue Uplift', value: '+14%', trend: 'up' },
        performance: { revenue: 210000, uplift: 14, roi: 3.5, discountDepth: 40, orders: 560 },
        skus: [],
      },
    ]);

    await PromoUplift.insertMany([
      { month: 'Jan', uplift: 12, revenue: 420000, campaignsCount: 3, topCategory: 'Beverages' },
      { month: 'Feb', uplift: 15, revenue: 480000, campaignsCount: 4, topCategory: 'Snacks' },
      { month: 'Mar', uplift: 18, revenue: 520000, campaignsCount: 4, topCategory: 'Grocery' },
      { month: 'Apr', uplift: 22, revenue: 610000, campaignsCount: 5, topCategory: 'Beverages' },
      { month: 'May', uplift: 24, revenue: 640000, campaignsCount: 5, topCategory: 'Beverages' },
      { month: 'Jun', uplift: 20, revenue: 580000, campaignsCount: 4, topCategory: 'Personal Care' },
    ]);

    await StockConflict.insertMany([
      {
        sku: 'SKU-BEV-882',
        name: 'Cola 2L Family Pack',
        category: 'Beverages',
        region: 'Chennai Hub',
        severity: 'High',
        availableStock: 120,
        committedStock: 280,
        shortfall: 160,
        status: 'Open',
      },
      {
        sku: 'SKU-SNK-441',
        name: 'Spicy Chips Party Size',
        category: 'Snacks',
        region: 'Chennai Hub',
        severity: 'Medium',
        availableStock: 45,
        committedStock: 90,
        shortfall: 45,
        status: 'Open',
      },
      {
        sku: 'SKU-DAI-109',
        name: 'Greek Yogurt 4-Pack',
        category: 'Dairy',
        region: 'Chennai Hub',
        severity: 'Low',
        availableStock: 200,
        committedStock: 220,
        shortfall: 20,
        status: 'Open',
      },
    ]);

    await PriceChange.insertMany([
      {
        sku: 'SKU-BEV-882',
        productName: 'Cola 2L Family Pack',
        category: 'Beverages',
        currentPrice: 199,
        proposedPrice: 179,
        marginImpact: '-2.1%',
        status: 'Pending',
        requestedBy: 'Sarah Miller',
      },
      {
        sku: 'SKU-GRO-220',
        productName: 'Organic Basmati 5kg',
        category: 'Grocery',
        currentPrice: 649,
        proposedPrice: 599,
        marginImpact: '-1.4%',
        status: 'Pending',
        requestedBy: 'Raj Kumar',
      },
    ]);

    res.status(201).json({
      success: true,
      message: 'Merch overview data seeded',
      data: {
        campaigns: campaigns.length,
        conflicts: 3,
        upliftMonths: 6,
        priceChanges: 2,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Merchandising performance report (KPIs + filtered campaigns)
// @route   GET /api/v1/merch/overview/performance-report
// @access  Public
const getPerformanceReport = async (req, res, next) => {
  try {
    const dateRange = String(req.query.dateRange || 'last-30');
    const region = String(req.query.region || 'all');
    const channel = String(req.query.channel || 'all');
    const campaignType = String(req.query.campaignType || 'all');

    const campaignQuery = {};
    if (region !== 'all') {
      campaignQuery.$or = [{ region }, { region: 'all' }];
    }
    if (channel !== 'all') {
      const channelClause = { $or: [{ channel }, { channel: 'all' }] };
      if (campaignQuery.$or) {
        campaignQuery.$and = [{ $or: campaignQuery.$or }, channelClause];
        delete campaignQuery.$or;
      } else {
        Object.assign(campaignQuery, channelClause);
      }
    }
    if (campaignType !== 'all') {
      campaignQuery.campaignCategory = campaignType;
    }

    const [campaigns, analyticsRecords, upliftRows] = await Promise.all([
      Campaign.find(campaignQuery).sort({ createdAt: -1 }).lean(),
      AnalyticsRecord.find({ type: 'campaign' }).lean(),
      PromoUplift.find().sort({ month: -1 }).lean(),
    ]);

    const analyticsByName = new Map(
      analyticsRecords.map((r) => [String(r.entityName || '').toLowerCase(), r])
    );

    const upliftLimit = dateRange === 'last-7' ? 1 : dateRange === 'this-quarter' ? 3 : 2;
    const periodUplift = upliftRows.slice(0, upliftLimit);
    const periodRevenue = periodUplift.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const periodUpliftAvg = periodUplift.length
      ? periodUplift.reduce((s, r) => s + (Number(r.uplift) || 0), 0) / periodUplift.length
      : 0;

    const rows = campaigns.map((c) => {
      const analytics = analyticsByName.get(String(c.name || '').toLowerCase());
      const perf = c.performance || {};
      const revenueRaw =
        Number(perf.revenue) ||
        Number(analytics?.revenue) ||
        0;
      const upliftRaw =
        (perf.uplift != null ? Number(perf.uplift) : null) ??
        (analytics?.uplift != null ? Number(analytics.uplift) : null) ??
        parseKpiPercent(c.kpi?.value) ??
        0;
      const roiRaw = Number(perf.roi) || Number(analytics?.roi) || 0;
      const discountRaw = Number(perf.discountDepth) || 0;

      return {
        id: String(c._id),
        name: c.name,
        revenue: formatInrShort(revenueRaw),
        revenueRaw,
        uplift: upliftRaw > 0 ? `+${upliftRaw.toFixed(1)}%` : '—',
        upliftRaw,
        roi: roiRaw > 0 ? `${roiRaw.toFixed(1)}x` : '—',
        roiRaw,
        discountDepth: discountRaw,
        type: c.campaignCategory || 'promo',
        region: c.region || 'na',
        channel: c.channel || 'all',
        status: c.status,
      };
    });

    const campaignRevenue = rows.reduce((s, r) => s + (r.revenueRaw || 0), 0);
    const totalRevenueRaw = campaignRevenue > 0 ? campaignRevenue : periodRevenue;
    const upliftValues = rows.map((r) => r.upliftRaw).filter((v) => v > 0);
    const avgUpliftRaw =
      upliftValues.length > 0
        ? upliftValues.reduce((a, b) => a + b, 0) / upliftValues.length
        : periodUpliftAvg;
    const discountValues = rows.map((r) => r.discountDepth).filter((v) => v > 0);
    const avgDiscountRaw =
      discountValues.length > 0
        ? discountValues.reduce((a, b) => a + b, 0) / discountValues.length
        : 0;
    const activeCount = campaigns.filter((c) => c.status === 'Active').length;

    res.status(200).json({
      success: true,
      data: {
        filters: { dateRange, region, channel, campaignType },
        kpis: {
          totalRevenue: formatInrShort(totalRevenueRaw),
          totalRevenueRaw,
          uplift: avgUpliftRaw > 0 ? `+${avgUpliftRaw.toFixed(1)}%` : '—',
          upliftRaw: avgUpliftRaw,
          activeCampaigns: String(activeCount),
          avgDiscount: avgDiscountRaw > 0 ? `${avgDiscountRaw.toFixed(1)}%` : '—',
          avgDiscountRaw,
        },
        campaigns: rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all campaigns
// @route   GET /api/v1/merch/campaigns
// @access  Public
const CAMPAIGN_TYPE_FILTER_REGEX = {
  discount: /discount/i,
  flash: /flash/i,
  bundle: /bundle/i,
  loyalty: /loyalty/i,
  bogo: /bogo/i,
  clearance: /clearance/i,
};

const getCampaigns = async (req, res, next) => {
  try {
    const { status, type, scope, region, typeFilter, running } = req.query;
    const query = {};

    if (running === 'true') {
      query.status = { $in: ['Active', 'Scheduled'] };
    } else if (status) {
      const statusMap = {
        active: 'Active',
        scheduled: 'Scheduled',
        draft: 'Draft',
        paused: 'Paused',
        archived: 'Archived',
        ended: 'Ended',
        stopped: 'Stopped',
      };
      query.status = statusMap[String(status).toLowerCase()] || status;
    }

    if (type) query.type = type;

    const filterKey = typeFilter ? String(typeFilter).toLowerCase() : '';
    if (filterKey && filterKey !== 'all' && filterKey !== 'all-types') {
      const regex = CAMPAIGN_TYPE_FILTER_REGEX[filterKey];
      if (regex) query.type = { $regex: regex.source, $options: 'i' };
    }

    if (scope) query.scope = scope;

    const regionKey = region ? String(region).toLowerCase() : '';
    if (regionKey && regionKey !== 'all' && regionKey !== 'all-regions') {
      const regionClause = { $or: [{ region: regionKey }, { region: 'all' }] };
      if (query.$or) {
        query.$and = [{ $or: query.$or }, regionClause];
        delete query.$or;
      } else {
        Object.assign(query, regionClause);
      }
    }

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
    const payload = await normalizeCampaignPayload(req.body || {});
    const campaign = await Campaign.create(payload);

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
    const body = req.body || {};
    const keys = Object.keys(body);
    const isStatusOnly = keys.length === 1 && keys[0] === 'status';

    let payload;
    if (isStatusOnly) {
      payload = { status: body.status };
    } else {
      payload = await normalizeCampaignPayload(body, { isPartial: false });
    }

    const campaign = await Campaign.findByIdAndUpdate(req.params.id, payload, {
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
  seedOverviewData,
  getMerchStats,
  getPerformanceReport,
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
