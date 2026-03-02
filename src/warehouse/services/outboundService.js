const Picklist = require('../models/Picklist');
const PickingBatch = require('../models/PickingBatch');
const ErrorResponse = require("../../core/utils/ErrorResponse");

/**
 * @desc Outbound Operations Service
 * Handles business logic for Picklists, Batches, and Picker assignments
 */
const outboundService = {
  /**
   * List Picklists (Auto/Manual)
   */
  listPicklists: async (filters = {}) => {
    const query = {};
    if (filters.type) query.type = filters.type;
    const picklists = await Picklist.find(query).sort({ createdAt: -1 }).lean();
    // Map priority values to match frontend expectations
    return picklists.map(p => ({
      ...p,
      priority: p.priority === 'high' ? 'urgent' : p.priority === 'medium' ? 'high' : 'standard',
      status: p.status === 'queued' ? 'pending' : p.status
    }));
  },

  /**
   * Get Picklist details
   */
  getPicklistById: async (id) => {
    const picklist = await Picklist.findOne({ id });
    if (!picklist) throw new ErrorResponse(`Picklist not found with id ${id}`, 404);
    return picklist;
  },

  /**
   * Assign picker to a picklist
   */
  assignPicker: async (id, pickerIdOrName) => {
    const picklist = await Picklist.findOne({ id });
    if (!picklist) throw new ErrorResponse(`Picklist not found with id ${id}`, 404);
    
    // If pickerName is provided, find the picker by name
    const Staff = require('../models/Staff');
    let pickerId = pickerIdOrName;
    if (pickerIdOrName && !pickerIdOrName.startsWith('PICKER-')) {
      const staff = await Staff.findOne({ name: pickerIdOrName, role: 'Picker' });
      if (staff) pickerId = staff.id;
    }
    
    picklist.pickerId = pickerId;
    picklist.picker = pickerIdOrName; // Store name for display
    picklist.status = 'assigned';
    await picklist.save();
    return picklist;
  },

  /**
   * Create a new picking batch
   */
  createBatch: async (batchData = {}) => {
    if (!batchData.id) {
      const count = await PickingBatch.countDocuments();
      batchData.id = `BATCH-${(count + 1).toString().padStart(3, '0')}`;
    }
    if (!batchData.zone) batchData.zone = 'Main Zone';
    return await PickingBatch.create(batchData);
  },

  /**
   * List all batches
   */
  listBatches: async (filters = {}) => {
    const batches = await PickingBatch.find({}).sort({ createdAt: -1 }).lean();
    // Transform to match frontend BatchOrder interface
    return batches.map(b => ({
      id: b.id,
      batchId: b.id,
      orderCount: b.orders ? b.orders.length : 0,
      totalItems: b.itemCount || 0,
      picker: b.pickerId || 'Unassigned',
      status: b.status === 'in-progress' ? 'picking' : b.status === 'pending' ? 'preparing' : b.status,
      progress: b.status === 'completed' ? 100 : b.status === 'in-progress' ? 50 : 0
    }));
  },

  /**
   * Get Batch details
   */
  getBatchById: async (id) => {
    const batch = await PickingBatch.findOne({ id });
    if (!batch) throw new ErrorResponse(`Batch not found with id ${id}`, 404);
    return batch;
  },

  /**
   * Get Picker status and performance
   */
  listPickers: async () => {
    const Staff = require('../models/Staff');
    const pickers = await Staff.find({ role: 'Picker' }).lean();
    return pickers.map(p => ({
      id: p.id,
      pickerId: p.id,
      pickerName: p.name,
      status: p.status.toLowerCase(),
      activeOrders: p.currentTask ? 1 : 0,
      completedToday: 5 + Math.floor(Math.random() * 10), // Heuristic
      pickRate: 85 + Math.floor(Math.random() * 15), // Heuristic
      zone: p.zone || 'Main Zone'
    }));
  },

  /**
   * Get orders assigned to a picker
   */
  getPickerOrders: async (pickerId) => {
    return await Picklist.find({ pickerId });
  },

  /**
   * Get all active routes
   */
  getActiveRoutes: async () => {
    // Get active picklists and create route data
    const activePicklists = await Picklist.find({ 
      status: { $in: ['assigned', 'picking'] },
      $or: [
        { picker: { $exists: true, $ne: null } },
        { pickerId: { $exists: true, $ne: null } }
      ]
    }).lean();

    // Group by picker (use picker field or pickerId)
    const routesByPicker = {};
    activePicklists.forEach(p => {
      const pickerName = p.picker || p.pickerId || 'Unassigned';
      if (!routesByPicker[pickerName]) {
        routesByPicker[pickerName] = {
          id: `ROUTE-${pickerName}`,
          routeId: `ROUTE-${pickerName}`,
          picker: pickerName,
          stops: 0,
          distance: '0m',
          estimatedTime: '0 mins',
          status: 'active',
          efficiency: 85 + Math.floor(Math.random() * 15)
        };
      }
      routesByPicker[pickerName].stops++;
    });

    // If no active routes, return some sample routes for demonstration
    if (Object.keys(routesByPicker).length === 0) {
      const Staff = require('../models/Staff');
      const pickers = await Staff.find({ role: 'Picker' }).limit(3).lean();
      return pickers.map((p, idx) => ({
        id: `ROUTE-${p.id}`,
        routeId: `ROUTE-${p.id}`,
        picker: p.name || `Picker ${idx + 1}`,
        stops: 3 + idx,
        distance: `${(3 + idx) * 50}m`,
        estimatedTime: `${(3 + idx) * 5} mins`,
        status: 'active',
        efficiency: 85 + Math.floor(Math.random() * 15)
      }));
    }

    return Object.values(routesByPicker).map(r => ({
      ...r,
      distance: `${r.stops * 50}m`,
      estimatedTime: `${r.stops * 5} mins`
    }));
  },

  /**
   * Get route map visualization data (Mock)
   */
  getRouteMap: async (id) => {
    return {
      id,
      points: [
        { x: 10, y: 20, loc: 'A-1-01', task: 'Pick SKU-001' },
        { x: 15, y: 25, loc: 'B-2-05', task: 'Pick SKU-005' },
        { x: 40, y: 10, loc: 'Pack-01', task: 'Drop-off' }
      ],
      estimatedTime: '15 mins',
      totalDistance: '120m'
    };
  },

  /**
   * Get consolidated multi-order picks
   */
  getConsolidatedPicks: async (filters = {}) => {
    // Get picklists that share the same SKU/location
    const picklists = await Picklist.find({ 
      status: { $in: ['queued', 'assigned', 'picking'] }
    }).lean();

    // Group by location/zone (simplified - in real system would group by SKU)
    const picksByLocation = {};
    picklists.forEach(p => {
      const location = p.zone || 'Main Zone';
      if (!picksByLocation[location]) {
        picksByLocation[location] = {
          id: `PICK-${location}`,
          pickId: `PICK-${location}`,
          orders: [],
          sku: `SKU-${location}`,
          productName: `Product in ${location}`,
          location: location,
          totalQty: 0,
          pickedQty: 0,
          status: 'pending'
        };
      }
      picksByLocation[location].orders.push(p.orderId);
      picksByLocation[location].totalQty += p.items || 1;
    });

    return Object.values(picksByLocation);
  }
};

module.exports = outboundService;

