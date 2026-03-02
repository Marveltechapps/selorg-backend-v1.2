const GRN = require('../models/GRN');
const GRNItem = require('../models/GRNItem');
const PutawayTask = require('../models/PutawayTask');
const InterStoreTransfer = require('../models/InterStoreTransfer');
const TransferItem = require('../models/TransferItem');
const Truck = require('../models/Truck');
const InventoryItem = require('../models/InventoryItem');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/**
 * Get Inbound Summary
 * GET /api/darkstore/inbound/summary
 */
const getInboundSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Count trucks for today
    const trucksToday = await Truck.countDocuments({
      store_id: storeId,
      date: date,
    });

    // Count pending GRN orders
    const pendingGrn = await GRN.countDocuments({
      store_id: storeId,
      status: 'pending',
    });

    // Count pending putaway tasks
    const putawayTasks = await PutawayTask.countDocuments({
      store_id: storeId,
      status: { $in: ['pending', 'assigned', 'in_progress'] },
    });

    // Count pending inter-store transfers
    const interStoreTransfers = await InterStoreTransfer.countDocuments({
      to_store: storeId,
      status: { $in: ['pending', 'in_transit'] },
    });

    res.status(200).json({
      success: true,
      summary: {
        trucks_today: trucksToday,
        pending_grn: pendingGrn,
        putaway_tasks: putawayTasks,
        inter_store_transfers: interStoreTransfers,
      },
      date: date,
    });
  } catch (error) {
    logger.error('Get inbound summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch inbound summary',
    });
  }
};

/**
 * Get GRN List
 * GET /api/darkstore/inbound/grn
 */
const getGRNList = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const truckId = req.query.truckId;
    const search = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }
    if (truckId) {
      query.truck_id = truckId;
    }
    if (search) {
      query.$or = [
        { grn_id: { $regex: search, $options: 'i' } },
        { supplier: { $regex: search, $options: 'i' } },
        { truck_id: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count
    const totalItems = await GRN.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get GRN orders
    const grnOrders = await GRN.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      grn_orders: grnOrders,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get GRN list error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch GRN orders',
    });
  }
};

/**
 * Get GRN Details
 * GET /api/darkstore/inbound/grn/:grnId
 */
const getGRNDetails = async (req, res) => {
  try {
    const { grnId } = req.params;

    const grn = await GRN.findOne({ grn_id: grnId }).lean();
    if (!grn) {
      return res.status(404).json({
        success: false,
        error: 'GRN not found',
      });
    }

    const items = await GRNItem.find({ grn_id: grnId }).lean();

    res.status(200).json({
      success: true,
      grn: {
        ...grn,
        items: items,
      },
    });
  } catch (error) {
    logger.error('Get GRN details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch GRN details',
    });
  }
};

/**
 * Start GRN Processing
 * POST /api/darkstore/inbound/grn/:grnId/start
 */
const startGRNProcessing = async (req, res) => {
  try {
    const { grnId } = req.params;
    const { actual_arrival, notes } = req.body;

    const grn = await GRN.findOne({ grn_id: grnId });
    if (!grn) {
      return res.status(404).json({
        success: false,
        error: 'GRN not found',
      });
    }

    if (grn.status === 'in_progress' || grn.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'GRN is already in progress or completed',
      });
    }

    grn.status = 'in_progress';
    if (actual_arrival) {
      grn.actual_arrival = actual_arrival;
    }
    if (notes) {
      grn.notes = notes;
    }
    grn.updated_at = new Date().toISOString();

    await grn.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'inbound',
      user: req.userId || 'system',
      action: 'START_GRN_PROCESSING',
      details: {
        grn_id: grnId,
        supplier: grn.supplier,
        truck_id: grn.truck_id
      },
      store_id: grn.store_id,
    });

    res.status(200).json({
      success: true,
      grn_id: grnId,
      status: grn.status,
      message: 'GRN processing started',
    });
  } catch (error) {
    logger.error('Start GRN processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start GRN processing',
    });
  }
};

/**
 * Update GRN Item Quantity
 * PUT /api/darkstore/inbound/grn/:grnId/items/:sku
 */
const updateGRNItemQuantity = async (req, res) => {
  try {
    const { grnId, sku } = req.params;
    const { received_quantity, damaged_quantity, notes } = req.body;

    const grnItem = await GRNItem.findOne({ grn_id: grnId, sku: sku });
    if (!grnItem) {
      return res.status(404).json({
        success: false,
        error: 'GRN item not found',
      });
    }

    if (received_quantity !== undefined) {
      if (received_quantity > grnItem.expected_quantity) {
        return res.status(400).json({
          success: false,
          error: 'Received quantity cannot exceed expected quantity',
        });
      }
      grnItem.received_quantity = received_quantity;
    }

    if (damaged_quantity !== undefined) {
      grnItem.damaged_quantity = damaged_quantity;
    }

    // Update status based on quantities
    if (grnItem.received_quantity > 0 || grnItem.damaged_quantity > 0) {
      if (grnItem.damaged_quantity > 0) {
        grnItem.status = 'damaged';
      } else {
        grnItem.status = 'received';
      }
    }

    grnItem.updated_at = new Date().toISOString();
    await grnItem.save();

    // Update GRN received quantity
    const allItems = await GRNItem.find({ grn_id: grnId });
    const totalReceived = allItems.reduce((sum, item) => sum + (item.received_quantity || 0), 0);
    const grn = await GRN.findOne({ grn_id: grnId });
    if (grn) {
      grn.received_quantity = totalReceived;
      grn.updated_at = new Date().toISOString();
      await grn.save();
    }

    res.status(200).json({
      success: true,
      grn_id: grnId,
      sku: sku,
      received_quantity: grnItem.received_quantity,
      damaged_quantity: grnItem.damaged_quantity,
      message: 'Item quantity updated',
    });
  } catch (error) {
    logger.error('Update GRN item quantity error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update item quantity',
    });
  }
};

/**
 * Complete GRN Processing
 * POST /api/darkstore/inbound/grn/:grnId/complete
 */
const completeGRNProcessing = async (req, res) => {
  try {
    const { grnId } = req.params;
    const { notes, auto_create_putaway = true } = req.body;

    const grn = await GRN.findOne({ grn_id: grnId });
    if (!grn) {
      return res.status(404).json({
        success: false,
        error: 'GRN not found',
      });
    }

    // Check if GRN is in correct status
    if (grn.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: `GRN cannot be completed. Current status: ${grn.status}. GRN must be in 'in_progress' status.`,
        current_status: grn.status
      });
    }

    // Check if all items are processed
    const items = await GRNItem.find({ grn_id: grnId });
    const unprocessedItems = items.filter(
      (item) => item.status === 'pending' && item.received_quantity === 0
    );

    if (unprocessedItems.length > 0) {
      logger.error('Complete GRN failed:', {
        grnId,
        unprocessedCount: unprocessedItems.length,
        unprocessedItems: unprocessedItems.map(i => ({ sku: i.sku, status: i.status, received: i.received_quantity }))
      });
      
      return res.status(400).json({
        success: false,
        error: 'Cannot complete GRN. Some items are not processed',
        details: {
          unprocessed_items_count: unprocessedItems.length,
          total_items: items.length,
          unprocessed_items: unprocessedItems.map(i => ({
            sku: i.sku,
            product_name: i.product_name,
            status: i.status,
            received_quantity: i.received_quantity,
            expected_quantity: i.expected_quantity
          }))
        }
      });
    }

    grn.status = 'completed';
    if (notes) {
      grn.notes = notes;
    }
    grn.updated_at = new Date().toISOString();
    await grn.save();

    let putawayTasksCreated = 0;

    // Create putaway tasks if requested
    if (auto_create_putaway) {
      for (const item of items) {
        if (item.received_quantity > 0) {
          const taskId = generateId('PUTAWAY');
          const now = new Date().toISOString();

          // Get item location from inventory if available
          const inventoryItem = await InventoryItem.findOne({ sku: item.sku });
          const location = inventoryItem?.location || 'TBD';

          await PutawayTask.create({
            task_id: taskId,
            grn_id: grnId,
            sku: item.sku,
            product_name: item.product_name,
            quantity: item.received_quantity,
            location: location,
            status: 'pending',
            store_id: grn.store_id,
            created_at: now,
            updated_at: now,
          });

          putawayTasksCreated++;
        }
      }
    }

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'inbound',
      user: req.userId || 'system',
      action: 'COMPLETE_GRN_PROCESSING',
      details: {
        grn_id: grnId,
        items_count: items.length,
        putaway_tasks_created: putawayTasksCreated
      },
      store_id: grn.store_id,
    });

    res.status(200).json({
      success: true,
      grn_id: grnId,
      status: 'completed',
      putaway_tasks_created: putawayTasksCreated,
      message: 'GRN processing completed and putaway tasks created',
    });
  } catch (error) {
    logger.error('Complete GRN processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete GRN processing',
    });
  }
};

/**
 * Get Putaway Tasks
 * GET /api/darkstore/inbound/putaway
 */
const getPutawayTasks = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const grnId = req.query.grnId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }
    if (grnId) {
      query.grn_id = grnId;
    }

    // Get total count
    const totalItems = await PutawayTask.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get putaway tasks
    const putawayTasks = await PutawayTask.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      putaway_tasks: putawayTasks,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get putaway tasks error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch putaway tasks',
    });
  }
};

/**
 * Assign Putaway Task
 * POST /api/darkstore/inbound/putaway/:taskId/assign
 */
const assignPutawayTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { staff_id, staff_name } = req.body;

    if (!staff_id || !staff_name) {
      return res.status(400).json({
        success: false,
        error: 'staff_id and staff_name are required',
      });
    }

    const task = await PutawayTask.findOne({ task_id: taskId });
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Putaway task not found',
      });
    }

    if (task.status === 'assigned' || task.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Task is already assigned or completed',
      });
    }

    task.status = 'assigned';
    task.assigned_to = staff_name;
    task.staff_id = staff_id;
    task.staff_name = staff_name;
    task.updated_at = new Date().toISOString();

    await task.save();

    res.status(200).json({
      success: true,
      task_id: taskId,
      assigned_to: staff_name,
      status: task.status,
      message: 'Putaway task assigned successfully',
    });
  } catch (error) {
    logger.error('Assign putaway task error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign putaway task',
    });
  }
};

/**
 * Complete Putaway Task
 * POST /api/darkstore/inbound/putaway/:taskId/complete
 */
const completePutawayTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { actual_location, notes } = req.body;

    const task = await PutawayTask.findOne({ task_id: taskId });
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Putaway task not found',
      });
    }

    if (task.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Task is already completed',
      });
    }

    if (task.status === 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Task is not assigned or already completed',
      });
    }

    task.status = 'completed';
    if (actual_location) {
      task.actual_location = actual_location;
    }
    if (notes) {
      task.notes = notes;
    }
    task.updated_at = new Date().toISOString();

    await task.save();

    // Update inventory stock level
    const inventoryItem = await InventoryItem.findOne({ sku: task.sku });
    if (inventoryItem) {
      inventoryItem.stock = (inventoryItem.stock || 0) + task.quantity;
      if (actual_location) {
        inventoryItem.location = actual_location;
      }
      await inventoryItem.save();
    }

    res.status(200).json({
      success: true,
      task_id: taskId,
      status: task.status,
      message: 'Putaway task completed successfully',
    });
  } catch (error) {
    logger.error('Complete putaway task error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete putaway task',
    });
  }
};

/**
 * Get Inter-Store Transfers
 * GET /api/darkstore/inbound/transfers
 */
const getInterStoreTransfers = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { to_store: storeId };
    if (status !== 'all') {
      query.status = status;
    }

    // Get total count
    const totalItems = await InterStoreTransfer.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get transfers
    const transfers = await InterStoreTransfer.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      transfers: transfers,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get inter-store transfers error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transfers',
    });
  }
};

/**
 * Receive Inter-Store Transfer
 * POST /api/darkstore/inbound/transfers/:transferId/receive
 */
const receiveInterStoreTransfer = async (req, res) => {
  try {
    const { transferId } = req.params;
    const { actual_arrival, notes, auto_create_putaway = true } = req.body;

    const transfer = await InterStoreTransfer.findOne({ transfer_id: transferId });
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found',
      });
    }

    if (transfer.status === 'received' || transfer.status === 'rejected') {
      return res.status(400).json({
        success: false,
        error: 'Transfer is already received or rejected',
      });
    }

    transfer.status = 'received';
    if (actual_arrival) {
      transfer.actual_arrival = actual_arrival;
    }
    if (notes) {
      transfer.notes = notes;
    }
    transfer.updated_at = new Date().toISOString();

    await transfer.save();

    let putawayTasksCreated = 0;

    // Create putaway tasks if requested
    if (auto_create_putaway) {
      const transferItems = await TransferItem.find({ transfer_id: transferId });

      for (const item of transferItems) {
        if (item.quantity > 0) {
          const taskId = generateId('PUTAWAY');
          const now = new Date().toISOString();

          // Get item location from inventory if available
          const inventoryItem = await InventoryItem.findOne({ sku: item.sku });
          const location = inventoryItem?.location || 'TBD';

          await PutawayTask.create({
            task_id: taskId,
            transfer_id: transferId,
            sku: item.sku,
            product_name: item.product_name,
            quantity: item.quantity,
            location: location,
            status: 'pending',
            store_id: transfer.to_store,
            created_at: now,
            updated_at: now,
          });

          putawayTasksCreated++;
        }
      }
    }

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'inbound',
      user: req.userId || 'system',
      action: 'RECEIVE_TRANSFER',
      details: {
        transfer_id: transferId,
        from_store: transfer.from_store,
        putaway_tasks_created: putawayTasksCreated
      },
      store_id: transfer.to_store,
    });

    res.status(200).json({
      success: true,
      transfer_id: transferId,
      status: 'received',
      putaway_tasks_created: putawayTasksCreated,
      message: 'Transfer received and putaway tasks created',
    });
  } catch (error) {
    logger.error('Receive inter-store transfer error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to receive transfer',
    });
  }
};

/**
 * Sync Inter-Store Transfers
 * POST /api/darkstore/inbound/transfers/sync
 */
const syncInterStoreTransfers = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const now = new Date().toISOString();

    // In a real production app, this would call a central ERP or another store's API
    // Here we simulate it by updating the timestamp of all pending/in_transit transfers
    const result = await InterStoreTransfer.updateMany(
      { to_store: storeId, status: { $in: ['pending', 'in_transit'] } },
      { $set: { updated_at: now } }
    );

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'update',
      module: 'inbound',
      user: req.userId || 'system',
      action: 'SYNC_TRANSFERS',
      details: {
        store_id: storeId,
        transfers_synced: result.modifiedCount,
        timestamp: now
      },
      store_id: storeId,
    });

    res.status(200).json({
      success: true,
      message: 'Inter-store transfers synced successfully',
      synced_count: result.modifiedCount,
      timestamp: now
    });
  } catch (error) {
    logger.error('Sync inter-store transfers error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync transfers',
    });
  }
};

module.exports = {
  getInboundSummary,
  getGRNList,
  getGRNDetails,
  startGRNProcessing,
  updateGRNItemQuantity,
  completeGRNProcessing,
  getPutawayTasks,
  assignPutawayTask,
  completePutawayTask,
  getInterStoreTransfers,
  receiveInterStoreTransfer,
  syncInterStoreTransfers,
};

