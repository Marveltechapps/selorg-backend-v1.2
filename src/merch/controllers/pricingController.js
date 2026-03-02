const SKU = require('../models/SKU');
const SurgeRule = require('../models/SurgeRule');
const SurgeConfig = require('../models/SurgeConfig');
const PriceChange = require('../models/PriceChange');
const PriceRule = require('../models/PriceRule');
const DiscountCampaign = require('../models/DiscountCampaign');
const { PricingCoupon } = require('../models/PricingCoupon');
const FlashSale = require('../models/FlashSale');
const Bundle = require('../models/Bundle');
const Zone = require('../models/Zone');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const { getPricingStats } = require('../services/pricingStatsService');

let Category;
try {
  Category = require('../../customer-backend/models/Category');
} catch (e) {
  Category = null;
}

function toApiDoc(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return { ...d, id: String(d._id) };
}

function toApiList(docs) {
  return (docs || []).map(toApiDoc);
}

// Derive FlashSale status from dates
function deriveFlashSaleStatus(doc) {
  const now = new Date();
  if (new Date(doc.endDate) < now) return 'ended';
  if (new Date(doc.startDate) > now) return 'upcoming';
  return 'active';
}

// --- Stats ---
const getPricingStatsHandler = async (req, res, next) => {
  try {
    const stats = await getPricingStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

// --- Surge Rules ---
const getSurgeRules = async (req, res, next) => {
  try {
    const rules = await SurgeRule.find().sort({ priority: -1, createdAt: -1 }).lean();
    const formatted = rules.map((r) => {
      const item = { ...r, id: String(r._id) };
      if (item.conditions?.zones) {
        item.conditions.zones = item.conditions.zones.map((z) => (typeof z === 'object' ? String(z._id || z) : String(z)));
      }
      return item;
    });
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const createSurgeRule = async (req, res, next) => {
  try {
    const rule = await SurgeRule.create(req.body);
    const formatted = toApiDoc(rule);
    if (formatted?.conditions?.zones) {
      formatted.conditions.zones = formatted.conditions.zones.map((z) => (typeof z === 'object' ? String(z._id || z) : String(z)));
    }
    res.status(201).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

const updateSurgeRule = async (req, res, next) => {
  try {
    const rule = await SurgeRule.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!rule) return next(new ErrorResponse(`Surge rule not found with id of ${req.params.id}`, 404));
    const formatted = { ...rule, id: String(rule._id) };
    if (formatted.conditions?.zones) {
      formatted.conditions.zones = formatted.conditions.zones.map((z) => (typeof z === 'object' ? String(z._id || z) : String(z)));
    }
    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

const deleteSurgeRule = async (req, res, next) => {
  try {
    const rule = await SurgeRule.findByIdAndDelete(req.params.id);
    if (!rule) return next(new ErrorResponse(`Surge rule not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// --- Discount Campaigns ---
const getDiscountCampaigns = async (req, res, next) => {
  try {
    const campaigns = await DiscountCampaign.find().sort({ createdAt: -1 }).lean();
    const formatted = campaigns.map((c) => ({ ...c, id: String(c._id) }));
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const createDiscountCampaign = async (req, res, next) => {
  try {
    const campaign = await DiscountCampaign.create(req.body);
    res.status(201).json({ success: true, data: toApiDoc(campaign) });
  } catch (err) {
    next(err);
  }
};

const updateDiscountCampaign = async (req, res, next) => {
  try {
    const campaign = await DiscountCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!campaign) return next(new ErrorResponse(`Discount campaign not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: toApiDoc(campaign) });
  } catch (err) {
    next(err);
  }
};

const deleteDiscountCampaign = async (req, res, next) => {
  try {
    const campaign = await DiscountCampaign.findByIdAndDelete(req.params.id);
    if (!campaign) return next(new ErrorResponse(`Discount campaign not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// --- Coupons ---
function formatCouponForApi(doc) {
  const d = doc.toObject ? doc.toObject() : doc;
  let discountType = d.discountType || 'percentage';
  if (discountType === 'percent') discountType = 'percentage';
  if (discountType === 'fixed') discountType = 'flat';
  return {
    ...d,
    id: String(d._id),
    discountType,
    minOrderValue: d.minOrderValue ?? d.minOrderAmount ?? 0,
    maxDiscount: d.maxDiscount ?? d.maxDiscountAmount ?? null,
    status: d.status || (d.isActive ? 'active' : 'paused'),
  };
}

const getCoupons = async (req, res, next) => {
  try {
    const coupons = await PricingCoupon.find().sort({ createdAt: -1 }).lean();
    const formatted = coupons.map((c) => ({
      ...c,
      id: String(c._id),
      minOrderValue: c.minOrderValue ?? c.minOrderAmount ?? 0,
      maxDiscount: c.maxDiscount ?? c.maxDiscountAmount ?? null,
      status: c.status || (c.isActive ? 'active' : 'paused'),
    }));
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const createCoupon = async (req, res, next) => {
  try {
    const body = { ...req.body };
    body.code = String(body.code || '').trim().toUpperCase();
    if (!body.code) return next(new ErrorResponse('Coupon code is required', 400));
    body.name = body.name || body.code;
    body.startDate = body.startDate ? new Date(body.startDate) : new Date();
    body.endDate = body.endDate ? new Date(body.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    body.validFrom = body.startDate;
    body.validTo = body.endDate;
    body.minOrderAmount = body.minOrderValue ?? body.minOrderAmount ?? 0;
    body.maxDiscountAmount = body.maxDiscount ?? body.maxDiscountAmount ?? null;
    body.isActive = body.status === 'active' || body.status === undefined;
    body.applicableCategories = body.applicableCategories || [];
    body.applicableProducts = body.applicableProducts || [];
    body.userSegments = body.userSegments || [];
    if (body.discountType === 'percentage') body.discountType = 'percent';
    if (body.discountType === 'flat') body.discountType = 'fixed';

    const coupon = await PricingCoupon.create(body);
    res.status(201).json({ success: true, data: formatCouponForApi(coupon) });
  } catch (err) {
    if (err.code === 11000) return next(new ErrorResponse('Coupon code already exists', 400));
    next(err);
  }
};

const updateCoupon = async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.code) body.code = String(body.code).trim().toUpperCase();
    if (body.startDate) body.validFrom = new Date(body.startDate);
    if (body.endDate) body.validTo = new Date(body.endDate);
    if (body.minOrderValue !== undefined) body.minOrderAmount = body.minOrderValue;
    if (body.maxDiscount !== undefined) body.maxDiscountAmount = body.maxDiscount;
    if (body.status === 'active') body.isActive = true;
    if (body.status === 'paused') body.isActive = false;
    if (body.discountType === 'percentage') body.discountType = 'percent';
    if (body.discountType === 'flat') body.discountType = 'fixed';

    const coupon = await PricingCoupon.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!coupon) return next(new ErrorResponse(`Coupon not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: formatCouponForApi(coupon) });
  } catch (err) {
    if (err.code === 11000) return next(new ErrorResponse('Coupon code already exists', 400));
    next(err);
  }
};

const deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await PricingCoupon.findByIdAndDelete(req.params.id);
    if (!coupon) return next(new ErrorResponse(`Coupon not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

const generateCouponCode = async (req, res, next) => {
  try {
    let code;
    for (let i = 0; i < 10; i++) {
      code = generateCode();
      const existing = await PricingCoupon.findOne({ code }).lean();
      if (!existing) break;
    }
    if (!code) return next(new ErrorResponse('Could not generate unique code', 500));
    res.status(200).json({ success: true, data: { code } });
  } catch (err) {
    next(err);
  }
};

// --- Flash Sales ---
const getFlashSales = async (req, res, next) => {
  try {
    const sales = await FlashSale.find().sort({ startDate: -1 }).lean();
    const formatted = sales.map((s) => {
      const status = s.status || deriveFlashSaleStatus(s);
      return { ...s, id: String(s._id), status };
    });
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const createFlashSale = async (req, res, next) => {
  try {
    const body = { ...req.body };
    body.products = body.products || [];
    body.status = body.status || deriveFlashSaleStatus(body);
    const sale = await FlashSale.create(body);
    const formatted = { ...sale.toObject(), id: String(sale._id) };
    formatted.status = formatted.status || deriveFlashSaleStatus(formatted);
    res.status(201).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

const updateFlashSale = async (req, res, next) => {
  try {
    const sale = await FlashSale.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!sale) return next(new ErrorResponse(`Flash sale not found with id of ${req.params.id}`, 404));
    const formatted = { ...sale.toObject(), id: String(sale._id) };
    formatted.status = formatted.status || deriveFlashSaleStatus(formatted);
    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

const deleteFlashSale = async (req, res, next) => {
  try {
    const sale = await FlashSale.findByIdAndDelete(req.params.id);
    if (!sale) return next(new ErrorResponse(`Flash sale not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// --- Bundles ---
const getBundles = async (req, res, next) => {
  try {
    const bundles = await Bundle.find().sort({ createdAt: -1 }).lean();
    const formatted = bundles.map((b) => ({ ...b, id: String(b._id) }));
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const createBundle = async (req, res, next) => {
  try {
    const body = { ...req.body };
    body.products = body.products || [];
    const totalOriginal = body.totalOriginalPrice ?? body.products.reduce((s, p) => s + (p.price || 0) * (p.quantity || 1), 0);
    const bundlePrice = body.bundlePrice ?? totalOriginal * 0.8;
    body.totalOriginalPrice = totalOriginal;
    body.bundlePrice = bundlePrice;
    body.savings = totalOriginal - bundlePrice;
    body.savingsPercent = totalOriginal > 0 ? Math.round(((totalOriginal - bundlePrice) / totalOriginal) * 10000) / 100 : 0;

    const bundle = await Bundle.create(body);
    res.status(201).json({ success: true, data: toApiDoc(bundle) });
  } catch (err) {
    next(err);
  }
};

const updateBundle = async (req, res, next) => {
  try {
    const bundle = await Bundle.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!bundle) return next(new ErrorResponse(`Bundle not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: toApiDoc(bundle) });
  } catch (err) {
    next(err);
  }
};

const deleteBundle = async (req, res, next) => {
  try {
    const bundle = await Bundle.findByIdAndDelete(req.params.id);
    if (!bundle) return next(new ErrorResponse(`Bundle not found with id of ${req.params.id}`, 404));
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// --- References ---
const getReferencesCategories = async (req, res, next) => {
  try {
    if (!Category) {
      return res.status(200).json({ success: true, data: [] });
    }
    const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
    const formatted = categories.map((c) => ({ id: String(c._id), name: c.name }));
    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

const getReferencesZones = async (req, res, next) => {
  try {
    const zones = await Zone.find({ status: 'Active' }).sort({ name: 1 }).lean();
    const formatted = zones.map((z) => ({ id: String(z._id), name: z.name }));
    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

// --- SKUs ---
const getPricingSKUs = async (req, res, next) => {
  try {
    const skus = await SKU.find().lean();
    const formatted = skus.map((s) => ({
      ...s,
      id: String(s._id),
      sku: s.code,
      code: s.code,
      base: s.basePrice ?? s.sellingPrice ?? 0,
      sell: s.sellingPrice ?? s.basePrice ?? 0,
      currentPrice: s.sellingPrice ?? 0,
      basePrice: s.basePrice ?? 0,
      competitor: s.competitorAvg ?? 0,
      competitorPrice: s.competitorAvg ?? 0,
      margin: s.margin ?? 0,
      marginStatus: s.marginStatus || 'healthy',
      history: s.history || [],
    }));
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const updateSKUPrice = async (req, res, next) => {
  try {
    let sku = await SKU.findById(req.params.id);
    if (!sku) return next(new ErrorResponse(`SKU not found with id of ${req.params.id}`, 404));
    const body = { ...req.body };
    if (body.base !== undefined) body.basePrice = body.base;
    if (body.sell !== undefined) body.sellingPrice = body.sell;
    if (body.competitor !== undefined) body.competitorAvg = body.competitor;
    const cost = sku.cost ?? 0;
    const sell = body.sellingPrice ?? body.sell ?? sku.sellingPrice;
    if (sell > 0 && cost > 0) body.margin = parseFloat((((sell - cost) / sell) * 100).toFixed(1));
    if (body.margin !== undefined) {
      body.marginStatus = body.margin < 10 ? 'critical' : body.margin < 15 ? 'warning' : 'healthy';
    }
    sku = await SKU.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    const formatted = { ...sku.toObject(), id: String(sku._id) };
    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

// --- Pending Updates ---
const getPendingUpdates = async (req, res, next) => {
  try {
    const updates = await PriceChange.find({ status: 'Pending' }).lean();
    const formatted = updates.map((u) => ({
      ...u,
      id: String(u._id),
      sku: u.sku,
      oldPrice: u.currentPrice,
      newPrice: u.proposedPrice,
      date: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
      reason: u.marginImpact || u.requestedBy || '',
      source: u.requestedBy || 'manual',
    }));
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const handlePendingUpdate = async (req, res, next) => {
  try {
    const rawStatus = (req.body.status || '').toString();
    const status = rawStatus.toLowerCase() === 'approved' ? 'Approved' : rawStatus.toLowerCase() === 'rejected' ? 'Rejected' : rawStatus;
    let update = await PriceChange.findById(req.params.id);
    if (!update) return next(new ErrorResponse(`Price update not found with id of ${req.params.id}`, 404));
    update = await PriceChange.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
    if (status === 'Approved' && update?.sku && update.proposedPrice) {
      await SKU.findOneAndUpdate({ code: update.sku }, { sellingPrice: update.proposedPrice });
    }
    const formatted = { ...update.toObject(), id: String(update._id) };
    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

// --- Price Rules ---
const getPriceRules = async (req, res, next) => {
  try {
    const rules = await PriceRule.find().sort({ createdAt: -1 }).lean();
    const formatted = rules.map((r) => ({ ...r, id: String(r._id) }));
    res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    next(err);
  }
};

const createPriceRule = async (req, res, next) => {
  try {
    const body = { ...req.body };
    body.name = body.name || 'Untitled Rule';
    body.type = body.type || 'base';
    body.scope = body.scope || 'region';
    body.pricingMethod = body.pricingMethod || 'fixed';
    body.status = body.status || 'pending';
    const rule = await PriceRule.create(body);
    res.status(201).json({ success: true, data: toApiDoc(rule) });
  } catch (err) {
    next(err);
  }
};

// --- Surge Config (enabled toggle) ---
const getSurgeConfig = async (req, res, next) => {
  try {
    let config = await SurgeConfig.findOne({ key: 'default' }).lean();
    if (!config) {
      await SurgeConfig.create({ key: 'default', enabled: true });
      config = { key: 'default', enabled: true };
    }
    res.status(200).json({ success: true, data: { enabled: config.enabled !== false } });
  } catch (err) {
    next(err);
  }
};

const updateSurgeConfig = async (req, res, next) => {
  try {
    const enabled = !!req.body.enabled;
    let config = await SurgeConfig.findOneAndUpdate(
      { key: 'default' },
      { enabled },
      { new: true, upsert: true }
    ).lean();
    res.status(200).json({ success: true, data: { enabled: config.enabled !== false } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPricingSKUs,
  updateSKUPrice,
  getSurgeRules,
  createSurgeRule,
  updateSurgeRule,
  deleteSurgeRule,
  getSurgeConfig,
  updateSurgeConfig,
  getPendingUpdates,
  handlePendingUpdate,
  getPriceRules,
  createPriceRule,
  getPricingStatsHandler,
  getDiscountCampaigns,
  createDiscountCampaign,
  updateDiscountCampaign,
  deleteDiscountCampaign,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  generateCouponCode,
  getFlashSales,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
  getBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  getReferencesCategories,
  getReferencesZones,
};
