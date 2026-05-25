const Campaign = require('../models/Campaign');
const SKU = require('../models/SKU');
const Zone = require('../models/Zone');
const Store = require('../models/Store');
const InventoryTransaction = require('../models/InventoryTransaction');
const { PricingCoupon } = require('../models/PricingCoupon');

let CustomerOrder;
try {
  CustomerOrder = require('../../customer-backend/models/Order').Order;
} catch {
  CustomerOrder = null;
}

let WarehouseOrder;
try {
  WarehouseOrder = require('../../warehouse/models/Order');
} catch {
  WarehouseOrder = null;
}

function rangeToDays(range) {
  if (range === '7days') return 7;
  if (range === '90days' || range === 'total') return 90;
  return 30;
}

function sinceDate(range) {
  const d = new Date();
  d.setDate(d.getDate() - rangeToDays(range));
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayMetricDate() {
  return new Date().toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function orderRevenueExpr() {
  return {
    $ifNull: [
      '$total_bill',
      { $ifNull: ['$totalBill', { $ifNull: ['$amount', 0] }] },
    ],
  };
}

function zoneStoreType(zoneType) {
  const t = String(zoneType || '').toLowerCase();
  if (t === 'express' || t === 'premium') return 'Dark Store';
  return 'Flagship';
}

function orderMatchesCampaign(order, campaign) {
  const name = String(campaign.name || '').trim().toLowerCase();
  if (!name) return false;

  const coupon = String(order.checkoutCouponCode || '').trim().toLowerCase();
  if (coupon && (coupon === name || coupon.includes(name) || name.includes(coupon))) {
    return true;
  }

  const skuCodes = new Set(
    (campaign.skus || [])
      .map((s) => String(s.sku || s.code || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (skuCodes.size === 0) return false;

  const items = order.items || [];
  return items.some((item) => {
    const keys = [
      item.sku,
      item.code,
      item.productName,
      item.variantId,
    ]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    return keys.some((k) => skuCodes.has(k) || [...skuCodes].some((c) => k.includes(c) || c.includes(k)));
  });
}

function rollupOrders(orders) {
  return orders.reduce(
    (acc, o) => {
      const revenue = Number(o.totalBill || 0);
      const discount = Number(o.discount || 0);
      const isRedemption = discount > 0 || Boolean(String(o.checkoutCouponCode || '').trim());
      acc.revenue += revenue;
      acc.orders += 1;
      acc.discount += discount;
      if (isRedemption) acc.redemptions += 1;
      return acc;
    },
    { revenue: 0, orders: 0, discount: 0, redemptions: 0 }
  );
}

async function computeBaselineAov(since) {
  if (!CustomerOrder) return 0;
  const rows = await CustomerOrder.aggregate([
    {
      $match: {
        status: { $nin: ['cancelled'] },
        createdAt: { $gte: since },
        $or: [
          { discount: { $lte: 0 } },
          { discount: { $exists: false } },
        ],
        $and: [
          {
            $or: [
              { checkoutCouponCode: { $exists: false } },
              { checkoutCouponCode: null },
              { checkoutCouponCode: '' },
            ],
          },
        ],
      },
    },
    {
      $group: {
        _id: null,
        avg: { $avg: '$totalBill' },
      },
    },
  ]);
  return Number(rows[0]?.avg || 0);
}

async function buildCampaignRecords(range) {
  const since = sinceDate(range);
  const metricDate = todayMetricDate();
  const campaigns = await Campaign.find({})
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  const baselineAov = await computeBaselineAov(since);

  let ordersInRange = [];
  if (CustomerOrder) {
    ordersInRange = await CustomerOrder.find({
      status: { $nin: ['cancelled'] },
      createdAt: { $gte: since },
    })
      .select('totalBill discount checkoutCouponCode items createdAt')
      .lean();
  }

  return campaigns.map((campaign) => {
    const matched = ordersInRange.filter((o) => orderMatchesCampaign(o, campaign));
    const rolled = rollupOrders(matched);
    const perf = campaign.performance || {};

    const revenue =
      rolled.orders > 0 ? rolled.revenue : Number(perf.revenue || 0);
    const orders =
      rolled.orders > 0 ? rolled.orders : Number(perf.orders || 0);
    const discount =
      rolled.orders > 0 ? rolled.discount : 0;

    const promoAov = orders > 0 ? revenue / orders : 0;
    const uplift =
      rolled.orders > 0 && baselineAov > 0
        ? round2(((promoAov / baselineAov) - 1) * 100)
        : round2(perf.uplift ?? 0);

    const roi =
      discount > 0
        ? round2(revenue / discount)
        : round2(perf.roi ?? (revenue > 0 ? revenue / Math.max(revenue * 0.1, 1) : 0));

    const redemptionRate =
      orders > 0 ? round2((rolled.redemptions / orders) * 100) : 0;

    const discountDepth =
      revenue > 0 ? round2((discount / revenue) * 100) : round2(perf.discountDepth ?? 0);

    return {
      type: 'campaign',
      entityId: String(campaign._id),
      entityName: campaign.name,
      metricDate,
      revenue: round2(revenue),
      orders,
      uplift,
      roi,
      metadata: {
        campaignType: campaign.type || 'Discount',
        status: campaign.status || 'Draft',
        redemptionRate,
        discountDepth,
        redemptions: rolled.redemptions,
        computedFrom: rolled.orders > 0 ? 'orders' : perf.revenue ? 'campaign.performance' : 'none',
      },
    };
  });
}

async function buildSkuRecords(range) {
  const since = sinceDate(range);
  const metricDate = todayMetricDate();
  const days = rangeToDays(range);

  const salesBySku = await InventoryTransaction.aggregate([
    {
      $match: {
        transactionType: 'sale',
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: '$sku',
        unitsSold: { $sum: '$quantity' },
        revenue: {
          $sum: {
            $cond: [
              { $gt: [{ $ifNull: ['$priceInfo.totalValue', 0] }, 0] },
              '$priceInfo.totalValue',
              {
                $multiply: [
                  { $ifNull: ['$priceInfo.unitPrice', 0] },
                  { $ifNull: ['$quantity', 0] },
                ],
              },
            ],
          },
        },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 100 },
  ]);

  let skuRollups = salesBySku;

  if (skuRollups.length === 0 && CustomerOrder) {
    const fromOrders = await CustomerOrder.aggregate([
      {
        $match: {
          status: { $nin: ['cancelled'] },
          createdAt: { $gte: since },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            $ifNull: ['$items.productName', '$items.variantId'],
          },
          unitsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
          revenue: {
            $sum: {
              $multiply: [
                { $ifNull: ['$items.price', 0] },
                { $ifNull: ['$items.quantity', 0] },
              ],
            },
          },
          promoOrders: {
            $sum: {
              $cond: [{ $gt: [{ $ifNull: ['$discount', 0] }, 0] }, 1, 0],
            },
          },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 100 },
    ]);
    skuRollups = fromOrders.map((r) => ({
      _id: r._id,
      unitsSold: r.unitsSold,
      revenue: r.revenue,
      promoImpact:
        r.orderCount > 0 ? round2((r.promoOrders / r.orderCount) * 100) : 0,
    }));
  }

  const codes = skuRollups.map((r) => r._id).filter(Boolean);
  const skus = await SKU.find({
    $or: [{ code: { $in: codes } }, { name: { $in: codes } }],
  }).lean();
  const skuByCode = new Map(skus.map((s) => [String(s.code).toLowerCase(), s]));
  const skuByName = new Map(skus.map((s) => [String(s.name).toLowerCase(), s]));

  return skuRollups.map((row) => {
    const key = String(row._id || '').toLowerCase();
    const sku = skuByCode.get(key) || skuByName.get(key);
    const unitsSold = Number(row.unitsSold || 0);
    const stock = Number(sku?.stock ?? 0);
    const dailyVelocity = unitsSold / Math.max(days, 1);
    const daysCover =
      dailyVelocity > 0 ? Math.max(0, Math.round(stock / dailyVelocity)) : stock > 0 ? 99 : 0;

    return {
      type: 'sku',
      entityId: sku ? String(sku._id) : String(row._id),
      entityName: sku?.name || String(row._id),
      metricDate,
      revenue: round2(row.revenue),
      unitsSold,
      metadata: {
        code: sku?.code || row._id,
        category: sku?.category || 'General',
        margin: round2(sku?.margin ?? 0),
        stock,
        daysCover,
        promoImpact: round2(row.promoImpact ?? 0),
        computedFrom: sku ? 'inventory_or_orders' : 'orders',
      },
    };
  });
}

async function buildRegionalRecords(range) {
  const since = sinceDate(range);
  const metricDate = todayMetricDate();

  const zones = await Zone.find({
    status: { $in: ['active', 'Active', 'testing', 'Testing'] },
  })
    .sort({ name: 1 })
    .lean();

  const zoneNames = zones.map((z) => z.name).filter(Boolean);
  const orderByZone = {};

  if (WarehouseOrder && zoneNames.length > 0) {
    const agg = await WarehouseOrder.aggregate([
      {
        $match: {
          zone: { $in: zoneNames },
          createdAt: { $gte: since },
          status: { $nin: ['returned', 'rto'] },
        },
      },
      {
        $group: {
          _id: '$zone',
          revenue: { $sum: orderRevenueExpr() },
          orders: { $sum: 1 },
        },
      },
    ]);
    for (const row of agg) {
      orderByZone[row._id] = row;
    }
  }

  const coupons = await PricingCoupon.find({
    $or: [{ status: 'active' }, { isActive: true }],
  })
    .select('targetZones usageCount')
    .lean();

  const stores = await Store.find({ zoneId: { $exists: true } })
    .select('_id zoneId')
    .lean();
  const storeZoneMap = new Map(
    stores.map((s) => [String(s._id), String(s.zoneId)])
  );

  const zoneCustomerStats = {};
  if (CustomerOrder && stores.length > 0) {
    const storeIds = stores.map((s) => s._id);
    const userOrders = await CustomerOrder.aggregate([
      {
        $match: {
          status: { $nin: ['cancelled'] },
          createdAt: { $gte: since },
          storeId: { $in: storeIds },
        },
      },
      {
        $group: {
          _id: { storeId: '$storeId', userId: '$userId' },
          orderCount: { $sum: 1 },
          revenue: { $sum: '$totalBill' },
        },
      },
    ]);

    for (const row of userOrders) {
      const zoneId = storeZoneMap.get(String(row._id.storeId));
      if (!zoneId) continue;
      if (!zoneCustomerStats[zoneId]) {
        zoneCustomerStats[zoneId] = { newCustomers: 0, returningCustomers: 0, revenue: 0, orders: 0 };
      }
      const bucket = zoneCustomerStats[zoneId];
      bucket.orders += row.orderCount;
      bucket.revenue += row.revenue;
      if (row.orderCount === 1) bucket.newCustomers += 1;
      else bucket.returningCustomers += 1;
    }
  }

  const globalRevenue = Object.values(orderByZone).reduce((s, r) => s + Number(r.revenue || 0), 0);
  const globalOrders = Object.values(orderByZone).reduce((s, r) => s + Number(r.orders || 0), 0);
  const globalAov = globalOrders > 0 ? globalRevenue / globalOrders : 0;

  return zones.map((zone) => {
    const zoneId = String(zone._id);
    const orderRow = orderByZone[zone.name] || {};
    const revenue = Number(orderRow.revenue ?? zone.analytics?.revenue ?? 0);
    const orders = Number(
      orderRow.orders ?? zone.analytics?.dailyOrders ?? zone.analytics?.totalOrders ?? 0
    );
    const aov = orders > 0 ? round2(revenue / orders) : 0;

    const zoneCoupons = coupons.filter((c) => {
      const targets = c.targetZones || [];
      return targets.length === 0 || targets.includes(zone.name);
    });
    const couponRedemptions = zoneCoupons.reduce(
      (sum, c) => sum + Number(c.usageCount || 0),
      0
    );
    const redemptionRate =
      orders > 0 ? round2((couponRedemptions / orders) * 100) : round2(couponRedemptions);

    const uplift =
      globalAov > 0 && aov > 0 ? round2(((aov / globalAov) - 1) * 100) : round2(zone.analytics?.uplift ?? 0);

    const cust = zoneCustomerStats[zoneId] || {};

    return {
      type: 'regional',
      entityId: zoneId,
      entityName: zone.name,
      metricDate,
      revenue: round2(revenue),
      orders,
      aov,
      redemptionRate,
      metadata: {
        storeType: zoneStoreType(zone.type),
        uplift,
        newCustomers: cust.newCustomers ?? 0,
        returningCustomers: cust.returningCustomers ?? 0,
        couponRedemptions,
        computedFrom: orderRow.orders ? 'warehouse_orders' : 'zone.analytics',
      },
    };
  });
}

async function getSummary(type, range = '30days') {
  if (type === 'campaign') return buildCampaignRecords(range);
  if (type === 'sku') return buildSkuRecords(range);
  if (type === 'regional') return buildRegionalRecords(range);

  const [campaign, sku, regional] = await Promise.all([
    buildCampaignRecords(range),
    buildSkuRecords(range),
    buildRegionalRecords(range),
  ]);
  return [...campaign, ...sku, ...regional];
}

async function getCampaignDetail(entityId, range = '30days') {
  const since = sinceDate(range);
  const days = rangeToDays(range);

  let campaign = null;
  if (entityId && /^[a-f0-9]{24}$/i.test(entityId)) {
    campaign = await Campaign.findById(entityId).lean();
  }
  if (!campaign) {
    campaign = await Campaign.findOne({ name: entityId }).lean();
  }
  if (!campaign) {
    return {
      campaignName: entityId,
      entityId,
      kpis: { revenue: 0, orders: 0, uplift: 0, roi: 0, redemptionRate: 0 },
      series: [],
    };
  }

  const baselineAov = await computeBaselineAov(since);
  let matched = [];
  if (CustomerOrder) {
    const ordersInRange = await CustomerOrder.find({
      status: { $nin: ['cancelled'] },
      createdAt: { $gte: since },
    })
      .select('totalBill discount checkoutCouponCode items createdAt')
      .lean();
    matched = ordersInRange.filter((o) => orderMatchesCampaign(o, campaign));
  }

  const rolled = rollupOrders(matched);
  const perf = campaign.performance || {};
  const revenue = rolled.orders > 0 ? rolled.revenue : Number(perf.revenue || 0);
  const orders = rolled.orders > 0 ? rolled.orders : Number(perf.orders || 0);
  const discount = rolled.discount;
  const promoAov = orders > 0 ? revenue / orders : 0;
  const uplift =
    rolled.orders > 0 && baselineAov > 0
      ? round2(((promoAov / baselineAov) - 1) * 100)
      : round2(perf.uplift ?? 0);
  const roi =
    discount > 0 ? round2(revenue / discount) : round2(perf.roi ?? 0);
  const redemptionRate =
    orders > 0 ? round2((rolled.redemptions / orders) * 100) : 0;

  const seriesMap = new Map();
  for (const order of matched) {
    const d = new Date(order.createdAt);
    const key = d.toISOString().slice(0, 10);
    if (!seriesMap.has(key)) {
      seriesMap.set(key, { sales: 0, redemptions: 0 });
    }
    const bucket = seriesMap.get(key);
    bucket.sales += Number(order.totalBill || 0);
    if (Number(order.discount || 0) > 0 || String(order.checkoutCouponCode || '').trim()) {
      bucket.redemptions += 1;
    }
  }

  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const bucket = seriesMap.get(key) || { sales: 0, redemptions: 0 };
    series.push({
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: key,
      sales: round2(bucket.sales),
      redemptions: bucket.redemptions,
    });
  }

  return {
    campaignName: campaign.name,
    entityId: String(campaign._id),
    kpis: {
      revenue: round2(revenue),
      orders,
      uplift,
      roi,
      redemptionRate,
      discountDepth: revenue > 0 ? round2((discount / revenue) * 100) : 0,
    },
    series,
  };
}

/** @deprecated Analytics are computed live; kept for API compatibility */
async function syncFromLiveData() {
  return getSummary(undefined, '30days').then((rows) => rows.length);
}

module.exports = {
  rangeToDays,
  sinceDate,
  syncFromLiveData,
  getSummary,
  getCampaignDetail,
  buildCampaignRecords,
  buildSkuRecords,
  buildRegionalRecords,
};
