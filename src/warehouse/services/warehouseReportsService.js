const GRN = require('../models/GRN');
const Picklist = require('../models/Picklist');
const InventoryItem = require('../models/InventoryItem');
const Staff = require('../models/Staff');

/**
 * @desc Warehouse Reports & Analytics Service
 */
const warehouseReportsService = {
  getSLAMetrics: async (range = 'today') => {
    // Mock SLA metrics
    return {
      period: range,
      inboundSLA: 94.5,
      outboundSLA: 92.1,
      orderAccuracy: 99.8,
      dockTurnaroundTime: '45 mins',
      trends: [
        { day: 'Mon', value: 92 },
        { day: 'Tue', value: 95 },
        { day: 'Wed', value: 94 }
      ]
    };
  },

  getInventoryHealth: async () => {
    const totalItems = await InventoryItem.countDocuments();
    const lowStockItems = await InventoryItem.countDocuments({ currentStock: { $lte: 10 } }); // Simple threshold
    
    return {
      healthScore: 92.5,
      totalSKUs: totalItems,
      stockAccuracy: 98.2,
      outOfStockRate: (lowStockItems / totalItems * 100).toFixed(1),
      excessStockValue: 12500,
      obsoleteInventory: 4.2
    };
  },

  getProductivityMetrics: async () => {
    // Mock productivity metrics
    return {
      averagePicksPerHour: 42,
      averagePacksPerHour: 35,
      topPerformers: [
        { name: 'John Doe', score: 98 },
        { name: 'Jane Smith', score: 95 }
      ],
      utilizationRate: 88.5
    };
  },

  getStorageUtilization: async () => {
    // Mock storage utilization data
    return [
      { category: 'Cold Storage', utilized: 85, capacity: 100 },
      { category: 'Ambient', utilized: 65, capacity: 100 },
      { category: 'Hazardous', utilized: 42, capacity: 100 }
    ];
  },

  getOutputTrends: async () => {
    // Mock weekly output trends
    return [
      { week: 'W1', inbound: 1200, outbound: 1100 },
      { week: 'W2', inbound: 1400, outbound: 1350 },
      { week: 'W3', inbound: 1100, outbound: 1250 },
      { week: 'W4', inbound: 1500, outbound: 1400 }
    ];
  },

  getInventoryByCategory: async () => {
    // Mock inventory breakdown
    return [
      { category: 'Electronics', count: 450, value: 45000 },
      { category: 'Groceries', count: 1200, value: 12000 },
      { category: 'Apparel', count: 800, value: 24000 }
    ];
  }
};

module.exports = warehouseReportsService;

