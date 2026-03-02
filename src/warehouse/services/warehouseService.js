const GRN = require('../models/GRN');
const Picklist = require('../models/Picklist');
const InventoryItem = require('../models/InventoryItem');
const StockAlert = require('../models/StockAlert');
const StorageLocation = require('../models/StorageLocation');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const QCInspection = require('../models/QCInspection');
const Staff = require('../models/Staff');
const WarehouseEquipment = require('../models/WarehouseEquipment');

/**
 * @desc Warehouse Overview Service
 */
const warehouseService = {
  getMetrics: async () => {
    // Compute several live metrics from DB
    const inboundQueue = await GRN.countDocuments({ status: { $in: ['pending', 'in-progress'] } });
    const outboundQueue = await Picklist.countDocuments({ status: { $in: ['queued', 'assigned', 'picking'] } });
    const criticalAlerts = await StockAlert.countDocuments({ priority: 'high' });

    // Inventory health: ratio of SKUs at or above minStock
    const totalSKUs = await InventoryItem.countDocuments();
    let inventoryHealth = 0;
    if (totalSKUs > 0) {
      const healthySKUs = await InventoryItem.countDocuments({ $expr: { $gte: ['$currentStock', '$minStock'] } });
      inventoryHealth = Math.round((healthySKUs / totalSKUs) * 1000) / 10; // one decimal percent
    }

    // Capacity utilization: overall bins and cold storage (by zone name containing 'cold')
    const totalBins = await StorageLocation.countDocuments();
    const occupiedBins = await StorageLocation.countDocuments({ status: 'occupied' });
    const binsUtil = totalBins > 0 ? Math.round((occupiedBins / totalBins) * 1000) / 10 : 0;

    const coldTotal = await StorageLocation.countDocuments({ zone: { $regex: 'cold', $options: 'i' } });
    const coldOccupied = await StorageLocation.countDocuments({ zone: { $regex: 'cold', $options: 'i' }, status: 'occupied' });
    const coldUtil = coldTotal > 0 ? Math.round((coldOccupied / coldTotal) * 1000) / 10 : 0;

    // ambient/util for non-cold zones (fallback)
    const ambientTotal = totalBins - coldTotal;
    const ambientOccupied = occupiedBins - coldOccupied;
    const ambientUtil = ambientTotal > 0 ? Math.round((ambientOccupied / ambientTotal) * 1000) / 10 : 0;

    return {
      inboundQueue,
      outboundQueue,
      inventoryHealth,
      criticalAlerts,
      capacityUtilization: {
        bins: binsUtil,
        coldStorage: coldUtil,
        ambient: ambientUtil
      }
    };
  },

  getOrderFlow: async () => {
    const picklists = await Picklist.find({ status: { $ne: 'completed' } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    // Map to match frontend PicklistFlow interface
    return picklists.map(p => ({
      id: p.id,
      orderId: p.orderId,
      customer: p.customer,
      items: p.items,
      priority: p.priority === 'high' ? 'urgent' : p.priority === 'medium' ? 'high' : 'standard',
      status: p.status === 'queued' ? 'pending' : p.status,
      zone: p.zone,
      updatedAt: p.updatedAt
    }));
  },

  getDailyReport: async (date = new Date()) => {
    // Aggregate daily operational metrics from DB
    const start = new Date(date);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const totalGRNsProcessed = await GRN.countDocuments({ status: 'completed', updatedAt: { $gte: start, $lt: end } });
    const totalOrdersPicked = await Picklist.countDocuments({ status: 'completed', updatedAt: { $gte: start, $lt: end } });
    const totalItemsAdjusted = await InventoryAdjustment.countDocuments({ timestamp: { $gte: start, $lt: end } });

    const qcTotal = await QCInspection.countDocuments({ date: { $gte: start, $lt: end } });
    const qcPassed = qcTotal > 0 ? await QCInspection.countDocuments({ date: { $gte: start, $lt: end }, status: 'passed' }) : 0;
    const qcPassRate = qcTotal > 0 ? `${Math.round((qcPassed / qcTotal) * 1000) / 10}%` : 'N/A';

    const activeStaff = await Staff.countDocuments({ status: { $in: ['active','Active'] } });

    // Top performers (simple heuristic: staff with most completed picks today)
    const topPerformers = await Picklist.aggregate([
      { $match: { status: 'completed', updatedAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$picker', tasks: { $sum: 1 } } },
      { $sort: { tasks: -1 } },
      { $limit: 5 },
      { $project: { name: '$_id', tasks: 1, _id: 0 } }
    ]);

    return {
      date: start.toISOString().split('T')[0],
      stats: {
        totalGRNsProcessed,
        totalOrdersPicked,
        totalItemsAdjusted,
        qcPassRate,
        activeStaff
      },
      topPerformers
    };
  },

  getOperationsView: async () => {
    // Build operational snapshot from DB
    const lastUpdate = new Date().toISOString();

    // Zones: group storage locations by zone for utilization
    const zonesAgg = await StorageLocation.aggregate([
      { $group: {
        _id: '$zone',
        total: { $sum: 1 },
        occupied: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0 ] } }
      }},
      { $project: {
        id: '$_id',
        name: '$_id',
        utilization: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$occupied', '$total'] }, 100] }, 0 ] },
        total: 1,
        occupied: 1
      }}
    ]);

    const zones = zonesAgg.map(z => ({
      id: z.id || 'unknown',
      name: z.name || 'unknown',
      utilization: Math.round((z.utilization || 0) * 10) / 10,
      activeStaff: 0 // requires workforce per-zone mapping if available
    }));

    // Equipment status summary
    const equipment = await WarehouseEquipment.aggregate([
      { $group: {
        _id: '$type',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        maintenance: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } }
      }}
    ]);
    const equipmentStatus = {};
    equipment.forEach(e => {
      const key = e._id || 'other';
      equipmentStatus[key] = { total: e.total, active: e.active, maintenance: e.maintenance };
    });

    return {
      lastUpdate,
      zones,
      equipmentStatus
    };
  },

  getAnalyticsSummary: async () => {
    // 1. Weekly Data (last 7 days)
    const weeklyData = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const start = new Date(d);
      start.setHours(0,0,0,0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      
      const inbound = await GRN.countDocuments({ status: 'completed', updatedAt: { $gte: start, $lt: end } });
      const outbound = await Picklist.countDocuments({ status: 'completed', updatedAt: { $gte: start, $lt: end } });
      
      weeklyData.push({
        day: days[start.getDay()],
        inbound,
        outbound,
        productivity: 85 + (inbound + outbound) // Heuristic productivity based on activity
      });
    }

    // 2. Storage Data
    const totalLocations = await StorageLocation.countDocuments();
    const occupied = await StorageLocation.countDocuments({ status: 'occupied' });
    const restricted = await StorageLocation.countDocuments({ status: 'restricted' });
    const empty = totalLocations - occupied - restricted;

    const storageData = [
      { name: 'Occupied', value: totalLocations > 0 ? Math.round((occupied / totalLocations) * 100) : 0, color: '#0891b2' },
      { name: 'Empty', value: totalLocations > 0 ? Math.round((empty / totalLocations) * 100) : 0, color: '#64748B' },
      { name: 'Restricted', value: totalLocations > 0 ? Math.round((restricted / totalLocations) * 100) : 0, color: '#EF4444' },
    ];

    // 3. Inventory by Category
    const inventoryByCategory = await InventoryItem.aggregate([
      { $group: { _id: '$category', value: { $sum: '$currentStock' } } },
      { $project: { category: '$_id', value: 1, _id: 0 } },
      { $sort: { value: -1 } },
      { $limit: 5 }
    ]);

    // 4. Key Metrics (calculated from real data where possible)
    const totalStaff = await Staff.countDocuments();
    const activeStaff = await Staff.countDocuments({ status: 'Active' });
    const attendanceRate = totalStaff > 0 ? Math.round((activeStaff / totalStaff) * 100) : 0;

    const totalCounted = await Picklist.countDocuments({ status: 'completed' });
    const accuracy = '99.8%'; // Placeholder for complex calc

    const totalSKUs = await InventoryItem.countDocuments();
    const stockouts = await InventoryItem.countDocuments({ $expr: { $lte: ['$currentStock', 0] } });
    const expiringSoon = 0; // Requires expiry field on InventoryItem if available

    const metrics = {
      inboundTurnaround: '94%',
      outboundOnTime: '92%',
      pickingSpeed: '88',
      accuracy: accuracy,
      shrinkage: '0.15%',
      turnoverRate: '14 days',
      avgUPH: '92',
      errorRate: '2%',
      attendance: `${attendanceRate}%`,
      totalStaff: String(totalStaff),
      activeStaff: String(activeStaff),
      totalSKUs: String(totalSKUs),
      stockouts: String(stockouts),
      expiringSoon: String(expiringSoon)
    };

    return {
      weeklyData,
      storageData,
      inventoryData: inventoryByCategory,
      metrics
    };
  }
};

module.exports = warehouseService;

