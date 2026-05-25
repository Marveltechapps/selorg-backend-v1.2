const mongoose = require('mongoose');
const Allocation = require('../models/Allocation');
const AllocationAlert = require('../models/AllocationAlert');
const SKU = require('../models/SKU');
const Warehouse = require('../models/Warehouse');
const TransferOrderService = require('./transferOrderService');
const { generateId } = require('../../utils/idGenerator');

const DEFAULT_LOCATIONS = [
  { locationId: 'central-wh', name: 'Central Warehouse', type: 'DC', tier: 1 },
  { locationId: 'south-hub', name: 'South Hub', type: 'REGIONAL_HUB', tier: 2 },
  { locationId: 'north-hub', name: 'North Hub', type: 'REGIONAL_HUB', tier: 2 },
  { locationId: 'westside-hub', name: 'Westside Hub', type: 'REGIONAL_HUB', tier: 2 },
  { locationId: 'city-center', name: 'City Center', type: 'STORE', tier: 3 },
];

function weekLabel(date = new Date()) {
  const d = new Date(date);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `W${week} ${d.getFullYear()}`;
}

function appendHistoryEntry(doc, demand, stock) {
  const entry = { week: weekLabel(), demand, stock, recordedAt: new Date() };
  const history = Array.isArray(doc.history) ? [...doc.history, entry] : [entry];
  return history.slice(-12);
}

class SkuAllocationService {
  static async ensureWarehouses() {
    const existing = await Warehouse.find({}).lean();
    if (existing.length >= DEFAULT_LOCATIONS.length) return existing;

    const created = [];
    for (let i = 0; i < DEFAULT_LOCATIONS.length; i++) {
      const loc = DEFAULT_LOCATIONS[i];
      let wh = await Warehouse.findOne({
        $or: [{ warehouseName: loc.name }, { code: loc.locationId }],
      });
      if (!wh) {
        wh = new Warehouse({
          warehouseId: `WH-${loc.locationId}`,
          warehouseName: loc.name,
          code: loc.locationId,
          type: loc.type,
          tier: loc.tier,
          capacity: { maxCapacity: 100000, currentUtilization: 0 },
          isActive: true,
          location: {
            city: 'Chennai',
            coordinates: {
              latitude: 13.08 + i * 0.04,
              longitude: 80.27 + i * 0.04,
            },
          },
        });
        await wh.save();
      } else if (!wh.location?.coordinates?.latitude) {
        wh.location = {
          city: 'Chennai',
          coordinates: {
            latitude: 13.08 + i * 0.04,
            longitude: 80.27 + i * 0.04,
          },
        };
        await wh.save();
      }
      created.push(wh);
    }
    return created;
  }

  static async resolveWarehouseObjectId(locationNameOrId) {
    if (!locationNameOrId) throw new Error('Location is required');
    const escaped = String(locationNameOrId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wh = await Warehouse.findOne({
      $or: [
        { warehouseName: new RegExp(`^${escaped}$`, 'i') },
        { code: locationNameOrId },
        { warehouseId: locationNameOrId },
        { locationId: locationNameOrId },
      ],
    });
    if (!wh) {
      throw new Error(`Warehouse not found for location: ${locationNameOrId}. Run seed or check location name.`);
    }
    return wh._id;
  }

  static async listAllocations() {
    return Allocation.find()
      .populate('skuId', 'name code category cost sellingPrice stock')
      .sort({ updatedAt: -1 })
      .lean();
  }

  static async updateAllocation(id, updates) {
    const allowed = ['allocated', 'target', 'onHand', 'inTransit', 'safetyStock'];
    const patch = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) patch[key] = updates[key];
    }
    if (updates.allocated !== undefined && updates.target === undefined) {
      patch.target = updates.allocated;
    }
    const current = await Allocation.findById(id);
    if (!current) return null;

    const stock = patch.onHand ?? current.onHand ?? 0;
    patch.history = appendHistoryEntry(current, Math.round((patch.target ?? current.target ?? 0) * 0.12), stock);

    return Allocation.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .populate('skuId', 'name code category cost')
      .lean();
  }

  static async rebalance(updates = []) {
    const results = [];
    for (const row of updates) {
      const id = row.allocationId ?? row.id;
      if (!id) continue;
      const updated = await this.updateAllocation(id, {
        allocated: row.allocated,
        target: row.target ?? row.allocated,
        onHand: row.onHand,
        inTransit: row.inTransit,
      });
      if (updated) results.push(updated);
    }
    return { updated: results.length, allocations: results };
  }

  static async autoRebalance(options = {}) {
    const scope = options.scope || 'high-priority';
    const strategy = options.strategy || 'minimize-stockouts';
    const allocations = await Allocation.find().populate('skuId', 'name code').lean();

    const bySku = {};
    for (const a of allocations) {
      const skuKey = (a.skuId?._id ?? a.skuId)?.toString();
      if (!skuKey) continue;
      if (!bySku[skuKey]) bySku[skuKey] = [];
      bySku[skuKey].push(a);
    }

    const updates = [];
    let stockoutsPrevented = 0;

    for (const rows of Object.values(bySku)) {
      const needsRebalance = rows.some((r) => {
        const target = r.target || 1;
        const ratio = (r.allocated ?? 0) / target;
        return ratio < 0.8;
      });
      if (scope === 'high-priority' && !needsRebalance) continue;

      const totalOnHand = rows.reduce((s, r) => s + (r.onHand ?? 0), 0);
      if (totalOnHand <= 0 || rows.length === 0) continue;

      const perLoc = Math.floor(totalOnHand / rows.length);
      rows.forEach((row, i) => {
        const newTarget = i === rows.length - 1
          ? totalOnHand - perLoc * (rows.length - 1)
          : perLoc;
        const beforeRatio = (row.allocated ?? 0) / (row.target || 1);
        if (beforeRatio < 0.8) stockoutsPrevented += 1;
        updates.push({
          allocationId: row._id,
          allocated: newTarget,
          target: newTarget,
        });
      });
    }

    const result = await this.rebalance(updates);
    return {
      stockoutsPrevented,
      totalTransfers: result.updated,
      costEstimate: result.updated * 12,
      strategy,
      ...result,
    };
  }

  static async getAllocationHistory(skuId) {
    const docs = await Allocation.find({ skuId }).lean();
    const merged = [];
    for (const doc of docs) {
      for (const h of doc.history ?? []) {
        merged.push({
          week: h.week,
          demand: h.demand ?? 0,
          stock: h.stock ?? 0,
        });
      }
    }
    if (merged.length === 0) {
      const week = weekLabel();
      const totalStock = docs.reduce((s, d) => s + (d.onHand ?? 0), 0);
      const totalTarget = docs.reduce((s, d) => s + (d.target ?? 0), 0);
      return [{
        week,
        demand: Math.round(totalTarget * 0.15),
        stock: totalStock,
      }];
    }
    const byWeek = {};
    for (const row of merged) {
      if (!byWeek[row.week]) byWeek[row.week] = { week: row.week, demand: 0, stock: 0 };
      byWeek[row.week].demand += row.demand;
      byWeek[row.week].stock += row.stock;
    }
    return Object.values(byWeek).slice(-12);
  }

  static async listAlerts() {
    return AllocationAlert.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
  }

  static async dismissAlert(id) {
    return AllocationAlert.findByIdAndUpdate(
      id,
      { status: 'dismissed' },
      { new: true },
    );
  }

  static async syncAlertsFromAllocations() {
    const allocations = await Allocation.find().populate('skuId', 'name code').lean();
    const activeIds = [];

    for (const a of allocations) {
      const target = a.target || 0;
      if (target <= 0) continue;
      const ratio = (a.allocated ?? 0) / target;
      if (ratio >= 0.5) continue;

      const skuName = a.skuId?.name ?? 'SKU';
      const severity = ratio < 0.3 ? 'critical' : 'warning';
      const existing = await AllocationAlert.findOne({
        allocationId: a._id,
        status: 'active',
        type: 'low_stock',
      });

      if (existing) {
        activeIds.push(existing._id);
        continue;
      }

      const alert = await AllocationAlert.create({
        skuId: a.skuId?._id ?? a.skuId,
        sku: skuName,
        location: a.locationName,
        locationId: a.locationId,
        allocationId: a._id,
        type: 'low_stock',
        severity,
        message: `${skuName} at ${a.locationName} is below target (${Math.round(ratio * 100)}% allocated).`,
        time: '24h',
      });
      activeIds.push(alert._id);
    }

    return activeIds.length;
  }

  static async listLocations() {
    await this.ensureWarehouses();
    const warehouses = await Warehouse.find({ isActive: { $ne: false } })
      .select('warehouseName code warehouseId')
      .lean();

    const stockByLocation = {};
    const allocations = await Allocation.find().lean();
    for (const a of allocations) {
      const key = a.locationName ?? a.locationId;
      stockByLocation[key] = (stockByLocation[key] ?? 0) + (a.onHand ?? 0);
    }

    return warehouses.map((w) => ({
      id: w._id.toString(),
      locationId: w.code ?? w.warehouseId,
      name: w.warehouseName,
      available: stockByLocation[w.warehouseName] ?? 0,
    }));
  }

  static async createTransferFromAllocation(body, createdBy = 'merch-user') {
    const {
      skuId, fromLocation, toLocation, quantity,
    } = body;
    if (!fromLocation || !toLocation || !quantity) {
      throw new Error('fromLocation, toLocation, and quantity are required');
    }

    const sourceId = await this.resolveWarehouseObjectId(fromLocation);
    const destId = await this.resolveWarehouseObjectId(toLocation);

    let resolvedSkuId = skuId;
    if (skuId && !mongoose.isValidObjectId(String(skuId))) {
      const byName = await SKU.findOne({
        $or: [{ name: String(skuId) }, { code: String(skuId) }],
      }).lean();
      resolvedSkuId = byName?._id;
    }
    const sku = resolvedSkuId ? await SKU.findById(resolvedSkuId).lean() : null;
    const items = [{
      sku: resolvedSkuId ? String(resolvedSkuId) : String(skuId),
      skuCode: sku?.code,
      quantityRequested: Number(quantity),
      unitCost: sku?.cost ?? 0,
    }];

    const createdById = mongoose.isValidObjectId(String(createdBy)) ? createdBy : undefined;
    const order = await TransferOrderService.createTransferOrder(
      sourceId,
      destId,
      items,
      createdById,
    );

    const destAlloc = resolvedSkuId ? await Allocation.findOne({
      skuId: resolvedSkuId,
      $or: [{ locationName: toLocation }, { locationId: toLocation }],
    }) : null;
    if (destAlloc) {
      await Allocation.findByIdAndUpdate(destAlloc._id, {
        $inc: { inTransit: Number(quantity) },
      });
    }

    return order;
  }

  static async seedAllocationData() {
    await this.ensureWarehouses();

    let skus = await SKU.find().limit(12).lean();
    if (skus.length === 0) {
      const samples = [
        { code: 'SKU-COLA-330', name: 'Cola Can 330ml', category: 'Beverages', brand: 'Selorg', cost: 18, basePrice: 35, sellingPrice: 40, stock: 5000 },
        { code: 'SKU-CHIPS-PP', name: 'Chips Party Pack', category: 'Snacks', brand: 'Selorg', cost: 45, basePrice: 89, sellingPrice: 99, stock: 3200 },
        { code: 'SKU-MILK-FC', name: 'Milk (Full Cream)', category: 'Dairy', brand: 'Selorg', cost: 28, basePrice: 52, sellingPrice: 58, stock: 1800 },
        { code: 'SKU-BREAD-WH', name: 'Whole Wheat Bread', category: 'Bakery', brand: 'Selorg', cost: 22, basePrice: 42, sellingPrice: 48, stock: 900 },
      ];
      for (const s of samples) {
        await SKU.findOneAndUpdate({ code: s.code }, s, { upsert: true, new: true });
      }
      skus = await SKU.find().limit(12).lean();
    }

    const locations = DEFAULT_LOCATIONS;
    let allocationCount = 0;

    for (const sku of skus) {
      for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        const target = 200 + (sku.stock ?? 500) / (locations.length * 2);
        const variance = (i * 37 + (sku.code?.length ?? 3) * 11) % 80;
        const allocated = Math.max(0, Math.round(target * (0.35 + (variance / 100))));
        const onHand = Math.max(0, Math.round(allocated * (0.85 + (i % 3) * 0.05)));
        const inTransit = i === 0 ? Math.round(target * 0.05) : 0;

        await Allocation.findOneAndUpdate(
          { skuId: sku._id, locationId: loc.locationId },
          {
            skuId: sku._id,
            locationId: loc.locationId,
            locationName: loc.name,
            allocated,
            target: Math.round(target),
            onHand,
            inTransit,
            safetyStock: Math.round(target * 0.2),
            history: [{
              week: weekLabel(),
              demand: Math.round(target * 0.14),
              stock: onHand,
            }],
          },
          { upsert: true, new: true },
        );
        allocationCount += 1;
      }
    }

    await AllocationAlert.deleteMany({});
    const lowStock = await Allocation.find()
      .populate('skuId', 'name')
      .lean();
    let alertCount = 0;
    for (const a of lowStock) {
      const target = a.target || 1;
      const ratio = (a.allocated ?? 0) / target;
      if (ratio >= 0.55) continue;
      await AllocationAlert.create({
        skuId: a.skuId?._id ?? a.skuId,
        sku: a.skuId?.name ?? 'SKU',
        location: a.locationName,
        locationId: a.locationId,
        allocationId: a._id,
        type: ratio < 0.35 ? 'low_stock' : 'low_stock',
        severity: ratio < 0.35 ? 'critical' : 'warning',
        message: `${a.skuId?.name ?? 'SKU'} at ${a.locationName} is below target (${Math.round(ratio * 100)}% allocated).`,
        time: ratio < 0.35 ? '12h' : '24h',
      });
      alertCount += 1;
    }

    const expirySku = skus[0];
    if (expirySku) {
      await AllocationAlert.create({
        skuId: expirySku._id,
        sku: expirySku.name,
        location: locations[locations.length - 1].name,
        locationId: locations[locations.length - 1].locationId,
        type: 'expiry',
        severity: 'warning',
        message: `Batch #B-${generateId().slice(0, 6)} for ${expirySku.name} expires in 3 days.`,
        batch: `B-${generateId().slice(0, 6)}`,
        time: '3d',
      });
      alertCount += 1;
    }

    return { allocationCount, alertCount, skuCount: skus.length };
  }
}

module.exports = SkuAllocationService;
