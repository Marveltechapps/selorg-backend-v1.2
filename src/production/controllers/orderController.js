const Order = require('../models/Order');
const RTOAlert = require('../models/RTOAlert');
const CustomerCall = require('../models/CustomerCall');
const AlertHistory = require('../models/AlertHistory');
const { generateId } = require('../../utils/helpers');

/**
 * Get Orders
 * GET /api/darkstore/orders
 */
const getOrders = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (status) {
      query.status = status;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      orders: orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch orders',
    });
  }
};

/**
 * Call customer for RTO risk order
 * POST /api/darkstore/orders/:orderId/call-customer
 */
const callCustomer = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, notes } = req.body || {};
    
    // Find order to get store_id
    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }
    
    const callId = generateId('CALL');
    
    // Generate random phone number for history
    const calledNumber = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    
    // Create customer call record
    const customerCall = new CustomerCall({
      call_id: callId,
      order_id: orderId,
      store_id: order.store_id,
      reason: reason || 'RTO risk - customer call initiated',
      status: 'initiated',
    });
    await customerCall.save();
    
    // Save action history
    const alertHistory = new AlertHistory({
      entity_type: 'ORDER',
      entity_id: orderId,
      alert_type: 'RTO',
      action: 'CALL_CUSTOMER',
      metadata: {
        call_id: callId,
        called_number: calledNumber,
        call_status: 'initiated',
        reason: reason || 'RTO risk - customer call initiated',
      },
      performed_by: 'system',
      store_id: order.store_id,
    });
    await alertHistory.save();
    
    // Update order RTO risk status if needed
    if (!order.rto_risk) {
      order.rto_risk = true;
      if (reason) order.rto_reason = reason;
      if (notes) order.rto_notes = notes;
      await order.save();
    }
    
    res.status(200).json({
      success: true,
      call_id: callId,
      status: 'initiated',
      called_number: calledNumber, // Include in response for frontend
      message: `Customer call initiated for order ${orderId}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate customer call',
    });
  }
};

/**
 * Mark order as RTO
 * POST /api/darkstore/orders/:orderId/mark-rto
 */
const markRTO = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, notes, rto_status } = req.body || {};
    
    // Find and update order
    const order = await Order.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }
    
    // Save previous status for history
    const previousStatus = order.status;
    
    // Update order with RTO information
    order.status = 'rto';
    order.rto_status = rto_status || 'marked_rto';
    order.rto_risk = true;
    
    if (reason) order.rto_reason = reason;
    if (notes) order.rto_notes = notes;
    
    await order.save();
    
    // Save action history
    const alertHistory = new AlertHistory({
      entity_type: 'ORDER',
      entity_id: orderId,
      alert_type: 'RTO',
      action: 'MARK_RTO',
      metadata: {
        previous_status: previousStatus,
        new_status: 'rto',
        rto_status: rto_status || 'marked_rto',
        reason: reason || 'Customer unreachable',
        notes: notes || '',
      },
      performed_by: 'system',
      store_id: order.store_id,
    });
    await alertHistory.save();
    
    // Mark RTO alert as resolved
    await RTOAlert.updateMany(
      { order_id: orderId, is_resolved: false },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        },
      }
    );
    
    res.status(200).json({
      success: true,
      order_id: orderId,
      rto_status: order.rto_status,
      message: `Order ${orderId} marked as RTO`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark order as RTO',
    });
  }
};

/**
 * Get alert history for an entity
 * GET /api/darkstore/alerts/history
 */
const getAlertHistory = async (req, res) => {
  try {
    const { entityType, entityId, alertType } = req.query;
    
    if (!entityType || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'entityType and entityId are required',
      });
    }
    
    const query = {
      entity_type: entityType.toUpperCase(),
      entity_id: entityId,
    };
    
    if (alertType) {
      query.alert_type = alertType.toUpperCase();
    }
    
    const history = await AlertHistory.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      history: history.map((item) => ({
        id: item._id.toString(),
        action: item.action,
        metadata: item.metadata,
        performed_by: item.performed_by,
        performed_at: item.createdAt,
        alert_type: item.alert_type,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch alert history',
    });
  }
};

module.exports = {
  getOrders,
  callCustomer,
  markRTO,
  getAlertHistory,
};

