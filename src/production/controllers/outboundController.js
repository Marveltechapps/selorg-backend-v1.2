const Dispatch = require('../models/Dispatch');
const Rider = require('../models/Rider');
const OutboundTransferRequest = require('../models/OutboundTransferRequest');
const PickPackTask = require('../models/PickPackTask');
const DispatchOrder = require('../models/DispatchOrder');
const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/**
 * Get Outbound Summary
 * GET /api/darkstore/outbound/summary
 */
const getOutboundSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Count active riders
    const activeRiders = await Rider.countDocuments({
      store_id: storeId,
      status: { $in: ['online', 'busy'] },
    });

    // Count pending transfer requests
    const pendingTransfers = await OutboundTransferRequest.countDocuments({
      from_store: storeId,
      status: 'pending',
    });

    // Count waiting riders
    const waitingRiders = await Rider.countDocuments({
      store_id: storeId,
      status: 'waiting',
    });

    // Count in transit dispatches
    const inTransit = await Dispatch.countDocuments({
      store_id: storeId,
      status: 'in_transit',
    });

    // Count delayed dispatches
    const storeDelays = await Dispatch.countDocuments({
      store_id: storeId,
      status: 'delayed',
    });

    res.status(200).json({
      success: true,
      summary: {
        active_riders: activeRiders,
        pending_transfers: pendingTransfers,
        waiting_riders: waitingRiders,
        in_transit: inTransit,
        store_delays: storeDelays,
      },
      date: date,
    });
  } catch (error) {
    logger.error('Get outbound summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch outbound summary',
    });
  }
};

/**
 * Get Dispatch Queue
 * GET /api/darkstore/outbound/dispatch
 */
const getDispatchQueue = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }

    // Get total count
    const totalItems = await Dispatch.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get dispatch queue
    const dispatchQueue = await Dispatch.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      dispatch_queue: dispatchQueue,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get dispatch queue error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dispatch queue',
    });
  }
};

/**
 * Get Active Riders
 * GET /api/darkstore/outbound/riders
 */
const getActiveRiders = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';

    // Build query
    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }

    // Get riders
    const riders = await Rider.find(query).sort({ last_update: -1 }).lean();

    res.status(200).json({
      success: true,
      riders: riders,
    });
  } catch (error) {
    logger.error('Get active riders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch riders',
    });
  }
};

/**
 * Batch Dispatch Orders
 * POST /api/darkstore/outbound/dispatch/batch
 */
const batchDispatchOrders = async (req, res) => {
  try {
    const { order_ids = [], auto_assign = true, rider_id } = req.body;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

    let finalOrderIds = [...order_ids];

    // Production-grade logic: if no orders provided, auto-select ready orders
    if (finalOrderIds.length === 0 && auto_assign) {
      const readyOrders = await Order.find({ 
        store_id: storeId, 
        status: 'ready' 
      }).limit(5).select('order_id');
      
      finalOrderIds = readyOrders.map(o => o.order_id);
    }

    if (finalOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No ready orders available for dispatch',
      });
    }

    const now = new Date().toISOString();
    let assignedRiders = 0;
    let ordersDispatched = 0;
    let responseDispatchId = null;
    let availableRiders = [];

    if (auto_assign) {
      // Auto-assign to available riders
      availableRiders = await Rider.find({
        store_id: storeId,
        status: { $in: ['online', 'waiting'] },
        $expr: { $lt: ['$current_orders', '$max_capacity'] },
      }).sort({ current_orders: 1 });

      if (availableRiders.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No available riders at capacity',
        });
      }

      // Group orders by rider for batch dispatch
      const dispatchGroups = new Map();
      let riderIndex = 0;

      for (const orderId of finalOrderIds) {
        // Check if order exists and is ready
        const order = await Order.findOne({ order_id: orderId, store_id: storeId });
        if (!order) {
          logger.warn(`Order ${orderId} not found for store ${storeId}`);
          continue;
        }
        if (order.status !== 'ready') {
          logger.warn(`Order ${orderId} is not ready (status: ${order.status})`);
          continue;
        }
        // Check if order is already dispatched
        const existingDispatch = await DispatchOrder.findOne({ order_id: orderId });
        if (existingDispatch) {
          logger.warn(`Order ${orderId} is already dispatched (dispatch_id: ${existingDispatch.dispatch_id})`);
          continue;
        }

        // Assign to rider
        const rider = availableRiders[riderIndex % availableRiders.length];
        
        if (!dispatchGroups.has(rider.rider_id)) {
          dispatchGroups.set(rider.rider_id, {
            rider: rider,
            orderIds: [],
          });
        }
        
        dispatchGroups.get(rider.rider_id).orderIds.push(orderId);
        
        if (dispatchGroups.get(rider.rider_id).orderIds.length >= rider.max_capacity - rider.current_orders) {
          riderIndex++;
        }
      }

      // Create dispatch records for each rider group
      for (const [riderId, group] of dispatchGroups) {
        const dispatchId = generateId('DSP');
        if (!responseDispatchId) {
          responseDispatchId = dispatchId;
        }
        
        // Create dispatch record
        await Dispatch.create({
          dispatch_id: dispatchId,
          rider_id: group.rider.rider_id,
          rider_name: group.rider.rider_name,
          status: 'assigned',
          orders_count: group.orderIds.length,
          dispatch_type: 'Batch',
          store_id: storeId,
          created_at: now,
          updated_at: now,
        });

        // Create dispatch order records and update orders
        for (const orderId of group.orderIds) {
          await DispatchOrder.create({
            dispatch_id: dispatchId,
            order_id: orderId,
            rider_id: group.rider.rider_id,
            assigned_at: now,
            store_id: storeId,
          });

          const order = await Order.findOne({ order_id: orderId, store_id: storeId });
          if (order) {
            order.status = 'processing';
            await order.save();
          }
          ordersDispatched++;
        }

        // Update rider
        group.rider.current_orders += group.orderIds.length;
        if (group.rider.status === 'online') {
          group.rider.status = 'busy';
        }
        group.rider.last_update = now;
        await group.rider.save();

        // Create audit log for each dispatch
        await AuditLog.create({
          id: generateId('AUD'),
          timestamp: now,
          action_type: 'data_push', // Re-using existing enum or adding new one? I'll use data_push for now or 'update'
          module: 'outbound',
          user: req.userId || 'system',
          action: 'BATCH_DISPATCH',
          details: {
            dispatch_id: dispatchId,
            rider_id: group.rider.rider_id,
            rider_name: group.rider.rider_name,
            orders_count: group.orderIds.length,
            order_ids: group.orderIds
          },
          store_id: storeId,
        });
      }

      assignedRiders = dispatchGroups.size;
    } else if (rider_id) {
      // Assign to specific rider
      const rider = await Rider.findOne({ rider_id: rider_id, store_id: storeId });
      if (!rider) {
        return res.status(404).json({
          success: false,
          error: 'Rider not found',
        });
      }

      if (rider.current_orders >= rider.max_capacity) {
        return res.status(400).json({
          success: false,
          error: 'Rider at maximum capacity',
        });
      }

      const dispatchId = generateId('DSP');

      // Create dispatch record
      await Dispatch.create({
        dispatch_id: dispatchId,
        rider_id: rider.rider_id,
        rider_name: rider.rider_name,
        status: 'assigned',
        orders_count: order_ids.length,
        dispatch_type: 'Batch',
        store_id: storeId,
        created_at: now,
        updated_at: now,
      });

      // Create dispatch order records
      for (const orderId of order_ids) {
        const order = await Order.findOne({ order_id: orderId, store_id: storeId });
        if (order && order.status === 'ready') {
          await DispatchOrder.create({
            dispatch_id: dispatchId,
            order_id: orderId,
            rider_id: rider.rider_id,
            assigned_at: now,
            store_id: storeId,
          });

          order.status = 'processing';
          await order.save();
          ordersDispatched++;
        }
      }

      // Update rider
      rider.current_orders += ordersDispatched;
      if (rider.status === 'online') {
        rider.status = 'busy';
      }
      rider.last_update = now;
      await rider.save();

      responseDispatchId = dispatchId;
      assignedRiders = 1;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either auto_assign must be true or rider_id must be provided',
      });
    }

    if (ordersDispatched === 0) {
      // Provide more detailed error message
      const readyOrdersCount = await Order.countDocuments({ 
        store_id: storeId, 
        status: 'ready',
        order_id: { $in: order_ids }
      });
      
      const alreadyDispatched = await DispatchOrder.countDocuments({ 
        order_id: { $in: order_ids } 
      });
      
      // Check each order's status
      const orderStatuses = [];
      for (const orderId of order_ids) {
        const order = await Order.findOne({ order_id: orderId, store_id: storeId }).lean();
        const dispatch = await DispatchOrder.findOne({ order_id: orderId }).lean();
        orderStatuses.push({
          order_id: orderId,
          status: order ? order.status : 'not_found',
          already_dispatched: !!dispatch,
          dispatch_id: dispatch ? dispatch.dispatch_id : null
        });
      }
      
      // Check available riders if not already checked
      if (availableRiders.length === 0 && auto_assign) {
        availableRiders = await Rider.find({
          store_id: storeId,
          status: { $in: ['online', 'waiting'] },
          $expr: { $lt: ['$current_orders', '$max_capacity'] }
        });
      }
      
      let errorMessage = 'No orders could be dispatched. ';
      if (readyOrdersCount === 0) {
        errorMessage += 'None of the provided orders are in ready status. ';
      }
      if (alreadyDispatched > 0) {
        errorMessage += `${alreadyDispatched} order(s) are already dispatched. `;
      }
      if (auto_assign && availableRiders.length === 0) {
        errorMessage += 'No available riders.';
      }
      
      logger.error('Batch dispatch failed:', {
        order_ids,
        storeId,
        readyOrdersCount,
        alreadyDispatched,
        availableRiders: availableRiders.length,
        orderStatuses
      });
      
      return res.status(400).json({
        success: false,
        error: errorMessage.trim(),
        details: {
          total_orders_requested: order_ids.length,
          ready_orders: readyOrdersCount,
          already_dispatched: alreadyDispatched,
          available_riders: availableRiders.length,
          order_statuses: orderStatuses
        }
      });
    }

    res.status(200).json({
      success: true,
      dispatch_id: responseDispatchId,
      assigned_riders: assignedRiders,
      orders_dispatched: ordersDispatched,
      message: 'Batch dispatch completed successfully',
    });
  } catch (error) {
    logger.error('Batch dispatch orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to batch dispatch orders',
    });
  }
};

/**
 * Manually Assign Rider
 * POST /api/darkstore/outbound/dispatch/assign
 */
const manuallyAssignRider = async (req, res) => {
  try {
    const { order_ids = [], rider_id, override_sla = false } = req.body;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

    let finalOrderIds = [...order_ids];

    // If no orders provided, auto-select one ready order
    if (finalOrderIds.length === 0) {
      const readyOrder = await Order.findOne({ 
        store_id: storeId, 
        status: 'ready' 
      }).select('order_id');
      
      if (readyOrder) {
        finalOrderIds = [readyOrder.order_id];
      }
    }

    if (finalOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No ready orders available for manual assignment',
      });
    }

    if (!rider_id) {
      return res.status(400).json({
        success: false,
        error: 'rider_id is required',
      });
    }

    const rider = await Rider.findOne({ rider_id: rider_id, store_id: storeId });
    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (rider.status === 'offline') {
      return res.status(400).json({
        success: false,
        error: 'Rider is currently offline',
      });
    }

    const now = new Date().toISOString();
    const dispatchId = generateId('DSP');
    let ordersAssigned = 0;

    // Create dispatch record
    await Dispatch.create({
      dispatch_id: dispatchId,
      rider_id: rider.rider_id,
      rider_name: rider.rider_name,
      status: 'assigned',
      orders_count: finalOrderIds.length,
      dispatch_type: 'Single',
      store_id: storeId,
      created_at: now,
      updated_at: now,
    });

    // Assign orders
    const orderStatuses = [];
    for (const orderId of finalOrderIds) {
      const order = await Order.findOne({ order_id: orderId, store_id: storeId });
      if (!order) {
        orderStatuses.push({ order_id: orderId, status: 'not_found', error: 'Order not found' });
        continue;
      }
      
      // Check if order is already assigned
      const existingDispatch = await DispatchOrder.findOne({ order_id: orderId });
      if (existingDispatch) {
        orderStatuses.push({ 
          order_id: orderId, 
          status: order.status, 
          error: 'Order already dispatched',
          dispatch_id: existingDispatch.dispatch_id 
        });
        continue;
      }
      
      if (order.status !== 'ready' && !override_sla) {
        orderStatuses.push({ 
          order_id: orderId, 
          status: order.status, 
          error: `Order is not ready (status: ${order.status})` 
        });
        continue;
      }

      await DispatchOrder.create({
        dispatch_id: dispatchId,
        order_id: orderId,
        rider_id: rider.rider_id,
        assigned_at: now,
        store_id: storeId,
      });

      order.status = 'processing';
      await order.save();
      ordersAssigned++;
      orderStatuses.push({ order_id: orderId, status: 'assigned', success: true });
    }

    if (ordersAssigned === 0) {
      // Provide detailed error message
      const readyOrdersCount = await Order.countDocuments({ 
        store_id: storeId, 
        status: 'ready',
        order_id: { $in: order_ids }
      });
      
      const alreadyDispatched = await DispatchOrder.countDocuments({ 
        order_id: { $in: order_ids } 
      });
      
      let errorMessage = 'No orders could be assigned. ';
      if (readyOrdersCount === 0) {
        errorMessage += 'None of the provided orders are in ready status. ';
      }
      if (alreadyDispatched > 0) {
        errorMessage += `${alreadyDispatched} order(s) are already dispatched. `;
      }
      if (rider.status === 'offline') {
        errorMessage += 'Rider is offline.';
      }
      
      logger.error('Manually assign rider failed:', {
        order_ids,
        rider_id,
        storeId,
        readyOrdersCount,
        alreadyDispatched,
        rider_status: rider.status,
        orderStatuses
      });
      
      // Delete the dispatch record we created since no orders were assigned
      await Dispatch.deleteOne({ dispatch_id: dispatchId });
      
      return res.status(400).json({
        success: false,
        error: errorMessage.trim(),
        details: {
          total_orders_requested: order_ids.length,
          ready_orders: readyOrdersCount,
          already_dispatched: alreadyDispatched,
          rider_status: rider.status,
          order_statuses: orderStatuses
        }
      });
    }

    // Update rider
    rider.current_orders += ordersAssigned;
    if (rider.status === 'online') {
      rider.status = 'busy';
    }
    rider.last_update = now;
    await rider.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'data_push',
      module: 'outbound',
      user: req.userId || 'system',
      action: 'MANUAL_ASSIGN',
      details: {
        dispatch_id: dispatchId,
        rider_id: rider.rider_id,
        rider_name: rider.rider_name,
        orders_assigned: ordersAssigned,
        order_ids: order_ids
      },
      store_id: storeId,
    });

    res.status(200).json({
      success: true,
      dispatch_id: dispatchId,
      rider_id: rider.rider_id,
      rider_name: rider.rider_name,
      orders_assigned: ordersAssigned,
      message: 'Rider assigned successfully',
    });
  } catch (error) {
    logger.error('Manually assign rider error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign rider',
    });
  }
};

/**
 * Get Outbound Transfer Requests
 * GET /api/darkstore/outbound/transfers
 */
const getOutboundTransferRequests = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { from_store: storeId };
    if (status !== 'all') {
      query.status = status;
    }

    // Get total count
    const totalItems = await OutboundTransferRequest.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get transfer requests
    const transferRequests = await OutboundTransferRequest.find(query)
      .sort({ requested_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      transfer_requests: transferRequests,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get outbound transfer requests error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transfer requests',
    });
  }
};

/**
 * Approve Transfer Request
 * POST /api/darkstore/outbound/transfers/:requestId/approve
 */
const approveTransferRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { notes, priority } = req.body;

    const transferRequest = await OutboundTransferRequest.findOne({ request_id: requestId });
    if (!transferRequest) {
      return res.status(404).json({
        success: false,
        error: 'Transfer request not found',
      });
    }

    if (transferRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Transfer request already processed or not found',
      });
    }

    transferRequest.status = 'approved';
    if (notes) {
      transferRequest.notes = notes;
    }
    if (priority) {
      transferRequest.priority = priority;
    }
    transferRequest.updated_at = new Date().toISOString();
    await transferRequest.save();

    // Create pick & pack task
    const pickPackTaskId = generateId('PP');
    const now = new Date().toISOString();

    await PickPackTask.create({
      pick_pack_task_id: pickPackTaskId,
      request_id: requestId,
      status: 'pending',
      picked: 0,
      total: transferRequest.items_count,
      store_id: transferRequest.from_store,
      created_at: now,
      updated_at: now,
    });

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'update',
      module: 'outbound',
      user: req.userId || 'system',
      action: 'APPROVE_TRANSFER',
      details: {
        request_id: requestId,
        priority: priority,
        items_count: transferRequest.items_count,
        to_store: transferRequest.to_store
      },
      store_id: transferRequest.from_store,
    });

    res.status(200).json({
      success: true,
      request_id: requestId,
      status: 'approved',
      pick_pack_task_id: pickPackTaskId,
      message: 'Transfer request approved and pick & pack task created',
    });
  } catch (error) {
    logger.error('Approve transfer request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve transfer request',
    });
  }
};

/**
 * Reject Transfer Request
 * POST /api/darkstore/outbound/transfers/:requestId/reject
 */
const rejectTransferRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason, notes } = req.body;

    const transferRequest = await OutboundTransferRequest.findOne({ request_id: requestId });
    if (!transferRequest) {
      return res.status(404).json({
        success: false,
        error: 'Transfer request not found',
      });
    }

    if (transferRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Transfer request already processed or not found',
      });
    }

    transferRequest.status = 'rejected';
    if (reason) {
      transferRequest.reason = reason;
    }
    if (notes) {
      transferRequest.notes = notes;
    }
    transferRequest.updated_at = new Date().toISOString();
    await transferRequest.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'outbound',
      user: req.userId || 'system',
      action: 'REJECT_TRANSFER',
      details: {
        request_id: requestId,
        reason: reason,
        to_store: transferRequest.to_store
      },
      store_id: transferRequest.from_store,
    });

    res.status(200).json({
      success: true,
      request_id: requestId,
      status: 'rejected',
      message: 'Transfer request rejected',
    });
  } catch (error) {
    logger.error('Reject transfer request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reject transfer request',
    });
  }
};

/**
 * Get Transfer Fulfillment Status
 * GET /api/darkstore/outbound/transfers/:requestId/fulfillment
 */
const getTransferFulfillmentStatus = async (req, res) => {
  try {
    const { requestId } = req.params;

    const transferRequest = await OutboundTransferRequest.findOne({ request_id: requestId });
    if (!transferRequest) {
      return res.status(404).json({
        success: false,
        error: 'Transfer request not found',
      });
    }

    const pickPackTask = await PickPackTask.findOne({ request_id: requestId });
    if (!pickPackTask) {
      return res.status(404).json({
        success: false,
        error: 'Pick & pack task not found for this transfer request',
      });
    }

    const percentage = pickPackTask.total > 0 
      ? Math.round((pickPackTask.picked / pickPackTask.total) * 100) 
      : 0;

    res.status(200).json({
      success: true,
      request_id: requestId,
      status: pickPackTask.status,
      picking_progress: {
        picked: pickPackTask.picked,
        total: pickPackTask.total,
        percentage: percentage,
      },
      picker: pickPackTask.picker || null,
      vehicle_id: pickPackTask.vehicle_id || null,
      estimated_completion: pickPackTask.estimated_completion || null,
    });
  } catch (error) {
    logger.error('Get transfer fulfillment status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch fulfillment status',
    });
  }
};

/**
 * Get Transfer SLA Summary
 * GET /api/darkstore/outbound/transfers/sla-summary
 */
const getTransferSLASummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Get all transfers for the date
    const allTransfers = await OutboundTransferRequest.find({
      from_store: storeId,
      requested_at: { $regex: date },
    });

    const completedTransfers = allTransfers.filter(t => t.status === 'completed');
    const onTimeTransfers = completedTransfers.filter(t => {
      if (!t.expected_dispatch) return false;
      const expected = new Date(t.expected_dispatch);
      const actual = t.updated_at ? new Date(t.updated_at) : new Date();
      return actual <= expected;
    });

    const onTimePercentage = completedTransfers.length > 0
      ? Math.round((onTimeTransfers.length / completedTransfers.length) * 100)
      : 0;

    // Calculate average prep time (simplified - in production would use actual timestamps)
    const averagePrepTime = '18m';

    res.status(200).json({
      success: true,
      on_time_dispatch_percentage: onTimePercentage,
      average_prep_time: averagePrepTime,
      total_transfers: allTransfers.length,
      completed_transfers: completedTransfers.length,
      date: date,
    });
  } catch (error) {
    logger.error('Get transfer SLA summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch SLA summary',
    });
  }
};

module.exports = {
  getOutboundSummary,
  getDispatchQueue,
  getActiveRiders,
  batchDispatchOrders,
  manuallyAssignRider,
  getOutboundTransferRequests,
  approveTransferRequest,
  rejectTransferRequest,
  getTransferFulfillmentStatus,
  getTransferSLASummary,
};

