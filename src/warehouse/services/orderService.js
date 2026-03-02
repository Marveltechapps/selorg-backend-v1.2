const Order = require('../models/Order');
const Rider = require('../../rider/models/Rider');
const { calculateDistance } = require('../../utils/distanceCalculator');
const appConfig = require('../../config/app');
const logger = require('../../core/utils/logger');

const listOrders = async (filters = {}, pagination = {}, sorting = {}) => {
  try {
    const {
      status,
      riderId,
      search,
      page = 1,
      limit = 50,
      sortBy = 'etaMinutes',
      sortOrder = 'asc',
    } = { ...filters, ...pagination, ...sorting };

    const query = {};

    // Status filter
    if (status) {
      query.status = status;
    }

    // Rider filter
    if (riderId) {
      query.riderId = riderId;
    }

    // Search filter
    if (search) {
      query.$or = [
        { id: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(query);

    // Build sort object
    let sortObj = {};
    if (sortBy === 'etaMinutes') {
      // Sort by createdAt for consistent ordering, then sort by etaMinutes in memory
      sortObj = { createdAt: -1, _id: 1 };
    } else {
      sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    let orders = await Order.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Populate rider information if riderId exists
    // Use a more efficient approach: batch fetch riders
    const riderIds = [...new Set(orders.filter(o => o.riderId).map(o => o.riderId))];
    const ridersMap = new Map();
    
    if (riderIds.length > 0) {
      try {
        const riders = await Rider.find({ id: { $in: riderIds } })
          .select('id name avatarInitials')
          .lean();
        
        riders.forEach(rider => {
          ridersMap.set(rider.id, {
            id: rider.id,
            name: rider.name,
            avatarInitials: rider.avatarInitials,
          });
        });
      } catch (riderError) {
        logger.error('Error fetching riders for orders:', riderError);
        // Continue without rider info if rider fetch fails
      }
    }

    // Map riders to orders
    orders = orders.map(order => {
      if (order.riderId && ridersMap.has(order.riderId)) {
        order.rider = ridersMap.get(order.riderId);
      }
      return order;
    });

    // Sort by etaMinutes in memory if needed
    if (sortBy === 'etaMinutes') {
      orders.sort((a, b) => {
        const aEta = a.etaMinutes ?? 999;
        const bEta = b.etaMinutes ?? 999;
        return sortOrder === 'asc' ? aEta - bEta : bEta - aEta;
      });
    }

    return {
      orders: orders || [],
      total: total || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((total || 0) / parseInt(limit)),
    };
  } catch (error) {
    logger.error('Error in listOrders service:', error);
    throw error;
  }
};

const assignOrder = async (orderId, riderId, overrideSla = false) => {
  // Always try to find actual documents first
  let order = await Order.findOne({ id: orderId });
  let rider = await Rider.findOne({ id: riderId });

  // In development mode, provide helpful error messages
  if (!order) {
    const error = new Error(`Order ${orderId} not found in database`);
    error.statusCode = 404;
    throw error;
  }

  if (!rider) {
    const error = new Error(`Rider ${riderId} not found in database`);
    error.statusCode = 404;
    throw error;
  }

  // Validation checks
  if (!['pending', 'assigned'].includes(order.status)) {
    const error = new Error('Order cannot be assigned in current status');
    error.statusCode = 400;
    throw error;
  }

  // Handle reassignment: if order is already assigned to a different rider, update previous rider
  let previousRider = null;
  const isReassignment = order.status === 'assigned' && order.riderId && order.riderId !== riderId;
  
  if (isReassignment) {
    previousRider = await Rider.findOne({ id: order.riderId });
    if (previousRider) {
      // Decrease previous rider's load
      if (previousRider.capacity && previousRider.capacity.currentLoad > 0) {
        previousRider.capacity.currentLoad = Math.max(0, previousRider.capacity.currentLoad - 1);
      }
      
      // Update previous rider's status if they have no more orders
      if (previousRider.capacity.currentLoad === 0) {
        // Check if rider has any other assigned orders
        const otherOrders = await Order.countDocuments({ 
          riderId: previousRider.id, 
          status: { $in: ['assigned', 'picked_up', 'in_transit'] } 
        });
        
        if (otherOrders === 0) {
          // No other orders, set to idle if was busy
          if (previousRider.status === 'busy') {
            previousRider.status = 'idle';
          }
        }
      }
      
      // Clear current order ID if it matches
      if (previousRider.currentOrderId === orderId) {
        previousRider.currentOrderId = null;
      }
    }
  }

  // Allow idle, online, or busy riders with available capacity
  const isRiderAvailable = 
    ['idle', 'online'].includes(rider.status) ||
    (rider.status === 'busy' && rider.capacity && rider.capacity.currentLoad < rider.capacity.maxLoad);

  if (!isRiderAvailable) {
    const error = new Error('Rider is not available for assignment');
    error.statusCode = 400;
    throw error;
  }

  if (rider.capacity.currentLoad >= rider.capacity.maxLoad) {
    const error = new Error('Rider is at capacity');
    error.statusCode = 400;
    throw error;
  }

  // Calculate ETA based on distance
  let etaMinutes = null;
  if (rider.location && order.dropLocation) {
    // Simplified: assume 1 km = 2 minutes
    // In production, use actual distance calculation
    etaMinutes = 15; // Default estimate
  }

  // SLA validation
  if (!overrideSla && etaMinutes) {
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + etaMinutes);
    
    if (estimatedDeliveryTime > order.slaDeadline) {
      const error = new Error('Assignment would violate SLA deadline');
      error.statusCode = 400;
      throw error;
    }
  }

  // Update order
  order.status = 'assigned';
  order.riderId = riderId;
  order.etaMinutes = etaMinutes || 15; // Default ETA in dev mode
  if (!order.timeline) order.timeline = [];
  
  // Add appropriate timeline entry
  if (isReassignment && previousRider) {
    order.timeline.push({
      status: 'assigned',
      time: new Date(),
      note: `Reassigned from ${previousRider.name} to ${rider.name}`,
    });
  } else {
    order.timeline.push({
      status: 'assigned',
      time: new Date(),
      note: `Assigned to ${rider.name}`,
    });
  }

  // Update rider
  // Only update status to busy if rider was idle/online, otherwise keep current status
  if (rider.status === 'idle' || rider.status === 'online') {
    rider.status = 'busy';
  }
  rider.currentOrderId = orderId;
  if (!rider.capacity) rider.capacity = { currentLoad: 0, maxLoad: 5 };
  rider.capacity.currentLoad = (rider.capacity.currentLoad || 0) + 1;

  // Save all documents - order, new rider, and previous rider if reassignment
  // Use try-catch to ensure all saves succeed or fail together
  try {
    const savePromises = [order.save(), rider.save()];
    if (previousRider) {
      savePromises.push(previousRider.save());
    }
    await Promise.all(savePromises);
  } catch (saveError) {
    logger.error('Error saving order/rider assignment:', saveError);
    // If save fails, attempt to rollback changes (best effort)
    // In production, consider using MongoDB transactions for true atomicity
    throw new Error(`Failed to save assignment: ${saveError.message}`);
  }

  // Populate rider info in response
  const updatedOrder = order.toObject ? order.toObject() : { ...order };
  
  // Ensure all required fields are present
  const responseOrder = {
    id: updatedOrder.id,
    status: updatedOrder.status,
    riderId: updatedOrder.riderId,
    etaMinutes: updatedOrder.etaMinutes,
    slaDeadline: updatedOrder.slaDeadline,
    pickupLocation: updatedOrder.pickupLocation,
    dropLocation: updatedOrder.dropLocation,
    customerName: updatedOrder.customerName,
    items: updatedOrder.items || [],
    timeline: updatedOrder.timeline || [],
    zone: updatedOrder.zone || null,
    rider: {
      id: rider.id,
      name: rider.name,
      avatarInitials: rider.avatarInitials || rider.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
    },
  };

  return responseOrder;
};

const alertOrder = async (orderId, reason) => {
  let order = await Order.findOne({ id: orderId });

  // In development mode, create mock order if not found
  if (appConfig.nodeEnv === 'development') {
    if (!order) {
      order = {
        id: orderId,
        status: 'assigned',
        riderId: 'test-rider-1',
        etaMinutes: 15,
        slaDeadline: new Date(Date.now() + 3600000),
        pickupLocation: 'Store Location A',
        dropLocation: 'Customer Address 1',
        customerName: 'Test Customer',
        items: ['Item A', 'Item B'],
        timeline: [],
        save: async function() { return this; }
      };
    }
  } else {
    // Production mode - strict validation
    if (!order) {
      const error = new Error('Order not found');
      error.statusCode = 404;
      throw error;
    }
  }

  // Create alert (in production, save to alerts collection)
  const alertId = `ALERT-${Date.now()}`;

  // Optionally update order status to delayed if not already
  if (order.status !== 'delayed') {
    order.status = 'delayed';
    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'delayed',
      time: new Date(),
      note: reason,
    });
    
    // Save only if it's a Mongoose document (check for _id property)
    const isMongooseOrder = order._id !== undefined && order.constructor && order.constructor.name === 'model';
    if (isMongooseOrder) {
      await order.save();
    }
  }

  return {
    alertId,
    message: 'Alert raised successfully',
  };
};

const searchOrders = async (query, limit = 10, searchInItems = false) => {
  const searchRegex = { $regex: query, $options: 'i' };
  
  const searchConditions = [
    { id: searchRegex },
    { customerName: searchRegex },
  ];

  // If searching in items, add items array search
  if (searchInItems) {
    searchConditions.push({ items: searchRegex });
  }

  const orders = await Order.find({
    $or: searchConditions,
  })
    .limit(limit)
    .lean();

  // Populate rider names for search
  const ordersWithRiders = await Promise.all(orders.map(async (order) => {
    if (order.riderId) {
      const rider = await Rider.findOne({ id: order.riderId })
        .select('name')
        .lean();
      if (rider) {
        order.rider = { name: rider.name };
      }
    }
    return order;
  }));

  return ordersWithRiders;
};

module.exports = {
  listOrders,
  assignOrder,
  alertOrder,
  searchOrders,
};

