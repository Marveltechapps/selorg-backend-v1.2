const Order = require('../../warehouse/models/Order');
const Rider = require('../models/Rider');
const AutoAssignRule = require('../models/AutoAssignRule');
const { calculateDistance } = require('../../utils/distanceCalculator');
const logger = require('../../core/utils/logger');

/**
 * Calculate order priority based on SLA deadline
 * @param {Date} slaDeadline - SLA deadline
 * @returns {string} Priority level (high, medium, low)
 */
const calculatePriority = (slaDeadline) => {
  const now = new Date();
  const timeUntilDeadline = slaDeadline - now;
  const minutesUntilDeadline = timeUntilDeadline / (1000 * 60);

  if (minutesUntilDeadline <= 30) {
    return 'high';
  } else if (minutesUntilDeadline <= 60) {
    return 'medium';
  }
  return 'low';
};

/**
 * Calculate distance from address string (simplified - would need geocoding in production)
 * For now, returns a mock distance based on order ID
 */
const calculateOrderDistance = (orderId) => {
  // Simplified: extract number from order ID and use as base distance
  const match = orderId.match(/\d+/);
  const num = match ? parseInt(match[0]) : 1000;
  return (num % 10) + 0.5; // Return distance between 0.5 and 9.5 km
};

/**
 * Get unassigned orders with filtering and sorting
 */
const listUnassignedOrders = async (filters = {}) => {
  try {
    const {
      priority = 'all',
      zone,
      search,
      sortBy = 'priority',
      sortOrder = 'asc',
      page = 1,
      limit = 50,
    } = filters;

    // Build query
    const query = { status: 'pending' };

    if (zone) {
      query.zone = zone;
    }

    if (search) {
      query.$or = [
        { id: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }

    // Get all unassigned orders
    let orders = await Order.find(query).lean();

    // Calculate priority, distance, and coordinates for each order
    orders = orders.map((order) => {
      const priorityLevel = calculatePriority(order.slaDeadline);
      const distance = calculateOrderDistance(order.id);
      const etaMinutes = Math.ceil(distance * 3); // Rough estimate: 3 minutes per km
      const pickupCoords = extractCoordinates(order.pickupLocation);
      const dropCoords = extractCoordinates(order.dropLocation);

      return {
        ...order,
        priority: priorityLevel,
        distance,
        etaMinutes,
        pickupLocation: typeof order.pickupLocation === 'string'
          ? { address: order.pickupLocation, coordinates: pickupCoords }
          : order.pickupLocation,
        dropLocation: typeof order.dropLocation === 'string'
          ? { address: order.dropLocation, coordinates: dropCoords }
          : order.dropLocation,
      };
    });

    // Filter by priority if not 'all'
    if (priority !== 'all') {
      orders = orders.filter((order) => order.priority === priority);
    }

    // Sort orders
    const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
    orders.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          comparison = (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
          break;
        case 'distance':
          comparison = a.distance - b.distance;
          break;
        case 'eta':
          comparison = a.etaMinutes - b.etaMinutes;
          break;
        case 'slaDeadline':
          comparison = new Date(a.slaDeadline) - new Date(b.slaDeadline);
          break;
        default:
          comparison = 0;
      }
      return comparison * sortMultiplier;
    });

    // Pagination
    const total = orders.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedOrders = orders.slice(skip, skip + limit);

    return {
      orders: paginatedOrders,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
    };
  } catch (error) {
    logger.error('Error listing unassigned orders:', error);
    throw error;
  }
};

/**
 * Get unassigned orders count with priority breakdown
 */
const getUnassignedOrdersCount = async (priority = 'all') => {
  try {
    const query = { status: 'pending' };
    const orders = await Order.find(query).lean();

    // Calculate priority for each order
    const ordersWithPriority = orders.map((order) => ({
      ...order,
      priority: calculatePriority(order.slaDeadline),
    }));

    // Filter by priority if not 'all'
    const filteredOrders = priority === 'all'
      ? ordersWithPriority
      : ordersWithPriority.filter((o) => o.priority === priority);

    // Calculate breakdown
    const priorityBreakdown = {
      high: 0,
      medium: 0,
      low: 0,
    };

    ordersWithPriority.forEach((order) => {
      priorityBreakdown[order.priority] = (priorityBreakdown[order.priority] || 0) + 1;
    });

    return {
      count: filteredOrders.length,
      priorityBreakdown,
    };
  } catch (error) {
    logger.error('Error getting unassigned orders count:', error);
    throw error;
  }
};

/**
 * Get map data (riders and orders)
 */
const getMapData = async (filters = {}) => {
  try {
    const {
      hubId,
      showRiders = true,
      showOrders = true,
      showPickupPoints = true,
    } = filters;

    const result = {
      riders: [],
      orders: [],
      pickupPoints: [],
      statusCounts: {
        riders: {},
        orders: {},
      },
    };

    // Get riders
    if (showRiders) {
      const riders = await Rider.find({}).lean();
      result.riders = riders.map((rider) => ({
        id: rider.id,
        name: rider.name,
        status: rider.status,
        location: rider.location || { lat: 0, lng: 0 },
        zone: rider.zone,
        capacity: rider.capacity,
        currentOrderId: rider.currentOrderId,
        avatarInitials: rider.avatarInitials,
      }));

      // Calculate rider status counts
      const riderStatusCounts = {};
      riders.forEach((rider) => {
        riderStatusCounts[rider.status] = (riderStatusCounts[rider.status] || 0) + 1;
      });
      result.statusCounts.riders = {
        online: riderStatusCounts.online || 0,
        busy: riderStatusCounts.busy || 0,
        in_transit: riderStatusCounts.in_transit || 0,
        idle: riderStatusCounts.idle || 0,
        offline: riderStatusCounts.offline || 0,
      };
    }

    // Get orders
    if (showOrders) {
      const orders = await Order.find({}).lean();
      result.orders = orders.map((order) => {
        // Extract coordinates from address (simplified - would need geocoding)
        const pickupCoords = extractCoordinates(order.pickupLocation);
        const dropCoords = extractCoordinates(order.dropLocation);

        return {
          id: order.id,
          status: order.status,
          pickupLocation: {
            address: order.pickupLocation,
            coordinates: pickupCoords,
          },
          dropLocation: {
            address: order.dropLocation,
            coordinates: dropCoords,
          },
          riderId: order.riderId,
          priority: calculatePriority(order.slaDeadline),
          zone: order.zone,
        };
      });

      // Calculate order status counts
      const orderStatusCounts = {};
      orders.forEach((order) => {
        orderStatusCounts[order.status] = (orderStatusCounts[order.status] || 0) + 1;
      });
      result.statusCounts.orders = {
        pending: orderStatusCounts.pending || 0,
        assigned: orderStatusCounts.assigned || 0,
        in_transit: orderStatusCounts.in_transit || 0,
        picked_up: orderStatusCounts.picked_up || 0,
        delivered: orderStatusCounts.delivered || 0,
      };
    }

    // Get pickup points (grouped by pickup location)
    if (showPickupPoints) {
      const orders = await Order.find({}).lean();
      const pickupMap = new Map();

      orders.forEach((order) => {
        const key = order.pickupLocation;
        if (!pickupMap.has(key)) {
          const coords = extractCoordinates(order.pickupLocation);
          pickupMap.set(key, {
            id: `PICKUP-${pickupMap.size + 1}`,
            address: order.pickupLocation,
            coordinates: coords,
            orderCount: 0,
          });
        }
        pickupMap.get(key).orderCount += 1;
      });

      result.pickupPoints = Array.from(pickupMap.values());
    }

    return result;
  } catch (error) {
    logger.error('Error getting map data:', error);
    throw error;
  }
};

/**
 * Extract coordinates from address (simplified - would need geocoding service)
 */
const extractCoordinates = (address) => {
  // Simplified: generate mock coordinates based on address hash
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const lat = 40.7128 + (hash % 100) / 1000; // NYC area
  const lng = -74.0060 + (hash % 200) / 1000;
  return { lat, lng };
};

/**
 * Get map riders
 */
const getMapRiders = async (filters = {}) => {
  try {
    const { status, zone } = filters;
    const query = {};

    if (status) {
      query.status = status;
    }
    if (zone) {
      query.zone = zone;
    }

    const riders = await Rider.find(query).lean();

    const ridersData = riders.map((rider) => ({
      id: rider.id,
      name: rider.name,
      status: rider.status,
      location: rider.location || { lat: 0, lng: 0 },
      zone: rider.zone,
      capacity: rider.capacity,
      currentOrderId: rider.currentOrderId,
      avatarInitials: rider.avatarInitials,
    }));

    // Calculate status counts
    const statusCounts = {};
    riders.forEach((rider) => {
      statusCounts[rider.status] = (statusCounts[rider.status] || 0) + 1;
    });

    return {
      riders: ridersData,
      statusCounts: {
        online: statusCounts.online || 0,
        busy: statusCounts.busy || 0,
        in_transit: statusCounts.in_transit || 0,
        idle: statusCounts.idle || 0,
        offline: statusCounts.offline || 0,
      },
    };
  } catch (error) {
    logger.error('Error getting map riders:', error);
    throw error;
  }
};

/**
 * Get map orders
 */
const getMapOrders = async (filters = {}) => {
  try {
    const { status, zone } = filters;
    const query = {};

    if (status) {
      query.status = status;
    }
    if (zone) {
      query.zone = zone;
    }

    const orders = await Order.find(query).lean();

    const ordersData = orders.map((order) => {
      const pickupCoords = extractCoordinates(order.pickupLocation);
      const dropCoords = extractCoordinates(order.dropLocation);

      return {
        id: order.id,
        status: order.status,
        pickupLocation: {
          address: order.pickupLocation,
          coordinates: pickupCoords,
        },
        dropLocation: {
          address: order.dropLocation,
          coordinates: dropCoords,
        },
        riderId: order.riderId,
        priority: calculatePriority(order.slaDeadline),
        zone: order.zone,
      };
    });

    // Get pickup points
    const pickupMap = new Map();
    orders.forEach((order) => {
      const key = order.pickupLocation;
      if (!pickupMap.has(key)) {
        const coords = extractCoordinates(order.pickupLocation);
        pickupMap.set(key, {
          id: `PICKUP-${pickupMap.size + 1}`,
          address: order.pickupLocation,
          coordinates: coords,
          orderCount: 0,
        });
      }
      pickupMap.get(key).orderCount += 1;
    });

    return {
      orders: ordersData,
      pickupPoints: Array.from(pickupMap.values()),
    };
  } catch (error) {
    logger.error('Error getting map orders:', error);
    throw error;
  }
};

/**
 * Get recommended riders for an order
 */
const getRecommendedRiders = async (orderId, filters = {}) => {
  try {
    const { search, limit = 20 } = filters;

    // Get order
    const order = await Order.findOne({ id: orderId }).lean();
    if (!order) {
      throw new Error('Order not found');
    }

    // Get available riders
    let ridersQuery = {
      $expr: { $lt: ['$capacity.currentLoad', '$capacity.maxLoad'] },
    };

    if (search) {
      ridersQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
      ];
    }

    const riders = await Rider.find(ridersQuery).lean();

    // Calculate recommendation scores
    const orderPriority = calculatePriority(order.slaDeadline);
    const orderPickupCoords = extractCoordinates(order.pickupLocation);
    const orderZone = order.zone;

    const ridersWithScores = riders.map((rider) => {
      let score = 0;

      // Zone match: +10 points
      if (rider.zone && orderZone && rider.zone === orderZone) {
        score += 10;
      }

      // Distance: calculate distance and subtract points (closer is better)
      if (rider.location) {
        const distance = calculateDistance(
          rider.location.lat,
          rider.location.lng,
          orderPickupCoords.lat,
          orderPickupCoords.lng
        );
        score -= distance * 2; // -2 points per km
      } else {
        score -= 20; // Penalty for no location
      }

      // Capacity: prefer riders with less load
      const loadRatio = rider.capacity.currentLoad / rider.capacity.maxLoad;
      score -= loadRatio * 10; // -10 points if at max capacity

      // Status: prefer online/idle over busy
      if (rider.status === 'online' || rider.status === 'idle') {
        score += 5;
      } else if (rider.status === 'busy') {
        score += 2; // Still acceptable but lower priority
      }

      // Rating: add rating as points
      score += (rider.rating || 0) * 2;

      // SLA urgency: bonus for high priority orders
      if (orderPriority === 'high') {
        score += 15;
      }

      // Calculate estimated pickup time (simplified)
      let estimatedPickupMinutes = 15; // Default
      if (rider.location) {
        const distance = calculateDistance(
          rider.location.lat,
          rider.location.lng,
          orderPickupCoords.lat,
          orderPickupCoords.lng
        );
        estimatedPickupMinutes = Math.ceil(distance * 3); // 3 minutes per km
      }

      return {
        id: rider.id,
        name: rider.name,
        zone: rider.zone,
        status: rider.status,
        load: {
          current: rider.capacity.currentLoad,
          max: rider.capacity.maxLoad,
        },
        estimatedPickupMinutes,
        distance: rider.location
          ? calculateDistance(
              rider.location.lat,
              rider.location.lng,
              orderPickupCoords.lat,
              orderPickupCoords.lng
            )
          : null,
        rating: rider.rating || 0,
        score,
        isRecommended: false, // Will be set after sorting
      };
    });

    // Sort by score (descending)
    ridersWithScores.sort((a, b) => b.score - a.score);

    // Mark top 3 as recommended
    const topRiders = Math.min(3, ridersWithScores.length);
    for (let i = 0; i < topRiders; i++) {
      ridersWithScores[i].isRecommended = true;
    }

    // Limit results
    const limitedRiders = ridersWithScores.slice(0, limit);

    return {
      riders: limitedRiders,
      orderDetails: {
        id: order.id,
        pickup: order.pickupLocation,
        distance: calculateOrderDistance(order.id),
        priority: orderPriority,
      },
    };
  } catch (error) {
    logger.error('Error getting recommended riders:', error);
    throw error;
  }
};

/**
 * Get order assignment details
 */
const getOrderAssignmentDetails = async (orderId) => {
  try {
    const order = await Order.findOne({ id: orderId }).lean();
    if (!order) {
      throw new Error('Order not found');
    }

    const priority = calculatePriority(order.slaDeadline);
    const distance = calculateOrderDistance(order.id);

    return {
      id: order.id,
      pickup: order.pickupLocation,
      drop: order.dropLocation,
      distance,
      priority,
      zone: order.zone,
      slaDeadline: order.slaDeadline,
      customerName: order.customerName,
      items: order.items,
    };
  } catch (error) {
    logger.error('Error getting order assignment details:', error);
    throw error;
  }
};

/**
 * Manually assign order to rider
 */
const assignOrder = async (orderId, riderId, overrideSla = false) => {
  try {
    // Get order and rider
    const order = await Order.findOne({ id: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error('Order is not pending');
    }

    const rider = await Rider.findOne({ id: riderId });
    if (!rider) {
      throw new Error('Rider not found');
    }

    // Check capacity
    if (rider.capacity.currentLoad >= rider.capacity.maxLoad) {
      throw new Error('Rider is at capacity');
    }

    // Check SLA (unless overridden)
    if (!overrideSla) {
      const now = new Date();
      const timeUntilDeadline = order.slaDeadline - now;
      const minutesUntilDeadline = timeUntilDeadline / (1000 * 60);

      // Calculate estimated pickup time
      let estimatedPickupMinutes = 15;
      if (rider.location) {
        const orderPickupCoords = extractCoordinates(order.pickupLocation);
        const distance = calculateDistance(
          rider.location.lat,
          rider.location.lng,
          orderPickupCoords.lat,
          orderPickupCoords.lng
        );
        estimatedPickupMinutes = Math.ceil(distance * 3);
      }

      // Warn if assignment would violate SLA
      if (minutesUntilDeadline < estimatedPickupMinutes + 10) {
        // Allow but could warn in production
      }
    }

    // Assign order
    order.status = 'assigned';
    order.riderId = riderId;
    order.etaMinutes = 15; // Default estimate
    order.timeline.push({
      status: 'assigned',
      time: new Date(),
      note: `Manually assigned to ${rider.name}`,
    });

    // Update rider
    rider.status = rider.status === 'offline' ? 'online' : 'busy';
    rider.currentOrderId = orderId;
    rider.capacity.currentLoad += 1;

    await Promise.all([order.save(), rider.save()]);

    return {
      orderId: order.id,
      riderId: rider.id,
      riderName: rider.name,
      status: 'assigned',
      etaMinutes: order.etaMinutes,
      assignedAt: new Date(),
      message: 'Order assigned successfully',
    };
  } catch (error) {
    logger.error('Error assigning order:', error);
    throw error;
  }
};

/**
 * Batch assign multiple orders
 */
const batchAssignOrders = async (orderIds = null) => {
  try {
    // Find unassigned orders
    let unassignedOrders;
    if (orderIds && orderIds.length > 0) {
      unassignedOrders = await Order.find({
        id: { $in: orderIds },
        status: 'pending',
      }).lean();
    } else {
      unassignedOrders = await Order.find({ status: 'pending' })
        .sort({ slaDeadline: 1 })
        .limit(100)
        .lean();
    }

    if (unassignedOrders.length === 0) {
      return {
        assigned: 0,
        failed: 0,
        assignments: [],
        totalProcessed: 0,
      };
    }

    // Find available riders
    const availableRiders = await Rider.find({
      $expr: { $lt: ['$capacity.currentLoad', '$capacity.maxLoad'] },
    }).lean();

    if (availableRiders.length === 0) {
      return {
        assigned: 0,
        failed: unassignedOrders.length,
        assignments: unassignedOrders.map((order) => ({
          orderId: order.id,
          riderId: null,
          status: 'failed',
          reason: 'No available riders',
        })),
        totalProcessed: unassignedOrders.length,
      };
    }

    const assignments = [];
    let assignedCount = 0;
    let failedCount = 0;

    // Assign orders using optimization algorithm
    for (const order of unassignedOrders) {
      let bestRider = null;
      let bestScore = -Infinity;

      const orderPriority = calculatePriority(order.slaDeadline);
      const orderPickupCoords = extractCoordinates(order.pickupLocation);
      const orderZone = order.zone;

      for (const rider of availableRiders) {
        // Skip if rider is at capacity
        if (rider.capacity.currentLoad >= rider.capacity.maxLoad) {
          continue;
        }

        // Calculate score
        let score = 0;

        // Zone match: +10 points
        if (rider.zone && orderZone && rider.zone === orderZone) {
          score += 10;
        }

        // Distance: calculate and subtract points
        if (rider.location) {
          const distance = calculateDistance(
            rider.location.lat,
            rider.location.lng,
            orderPickupCoords.lat,
            orderPickupCoords.lng
          );
          score -= distance * 2;
        } else {
          score -= 20;
        }

        // Capacity: prefer less loaded riders
        const loadRatio = rider.capacity.currentLoad / rider.capacity.maxLoad;
        score -= loadRatio * 10;

        // Status: prefer online/idle
        if (rider.status === 'online' || rider.status === 'idle') {
          score += 5;
        } else if (rider.status === 'busy') {
          score += 2;
        }

        // Rating
        score += (rider.rating || 0) * 2;

        // SLA urgency
        if (orderPriority === 'high') {
          score += 15;
        }

        if (score > bestScore) {
          bestScore = score;
          bestRider = rider;
        }
      }

      if (bestRider) {
        try {
          // Assign order
          const orderDoc = await Order.findOne({ id: order.id });
          const riderDoc = await Rider.findOne({ id: bestRider.id });

          orderDoc.status = 'assigned';
          orderDoc.riderId = bestRider.id;
          orderDoc.etaMinutes = 15;
          orderDoc.timeline.push({
            status: 'assigned',
            time: new Date(),
            note: `Batch-assigned to ${bestRider.name}`,
          });

          riderDoc.status = riderDoc.status === 'offline' ? 'online' : 'busy';
          riderDoc.currentOrderId = order.id;
          riderDoc.capacity.currentLoad += 1;

          await Promise.all([orderDoc.save(), riderDoc.save()]);

          // Update available riders list
          const riderIndex = availableRiders.findIndex((r) => r.id === bestRider.id);
          if (riderIndex !== -1) {
            availableRiders[riderIndex].capacity.currentLoad += 1;
          }

          assignments.push({
            orderId: order.id,
            riderId: bestRider.id,
            status: 'assigned',
            reason: null,
          });
          assignedCount++;
        } catch (error) {
          logger.error(`Failed to assign order ${order.id}:`, error);
          assignments.push({
            orderId: order.id,
            riderId: null,
            status: 'failed',
            reason: error.message,
          });
          failedCount++;
        }
      } else {
        assignments.push({
          orderId: order.id,
          riderId: null,
          status: 'failed',
          reason: 'No suitable rider found',
        });
        failedCount++;
      }
    }

    return {
      assigned: assignedCount,
      failed: failedCount,
      assignments,
      totalProcessed: unassignedOrders.length,
    };
  } catch (error) {
    logger.error('Error in batch assign:', error);
    throw error;
  }
};

/**
 * Auto-assign orders (legacy endpoint)
 */
const autoAssignOrders = async (orderIds = null) => {
  try {
    const result = await batchAssignOrders(orderIds);
    return {
      assigned: result.assigned,
      failed: result.failed,
    };
  } catch (error) {
    logger.error('Error in auto-assign:', error);
    throw error;
  }
};

/**
 * Generate next order ID (ORD-{number})
 */
const generateOrderId = async () => {
  const lastOrder = await Order.findOne({})
    .sort({ id: -1 })
    .select('id')
    .lean();
  let nextNum = 9000;
  if (lastOrder && lastOrder.id && /^ORD-(\d+)$/.test(lastOrder.id)) {
    nextNum = parseInt(lastOrder.id.replace('ORD-', ''), 10) + 1;
  }
  return `ORD-${nextNum}`;
};

/**
 * Create manual order (phone orders, re-dispatch, etc.)
 */
const createManualOrder = async (payload) => {
  try {
    const {
      orderType = 'standard',
      items,
      pickupLocation,
      dropLocation,
      customerName,
      customerPhone,
      zone,
      riderId,
    } = payload;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Order must have at least one item');
    }
    if (!dropLocation || typeof dropLocation !== 'string' || dropLocation.trim() === '') {
      throw new Error('Customer address (drop location) is required');
    }
    if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') {
      throw new Error('Customer name is required');
    }

    const pickup = pickupLocation && pickupLocation.trim()
      ? pickupLocation.trim()
      : 'Default Warehouse';
    const drop = dropLocation.trim();
    const name = customerName.trim();
    const itemList = items.map((i) => (typeof i === 'string' ? i : (i?.name || i?.id || String(i))));

    // SLA: standard ~60 min, express ~30 min
    const slaMinutes = orderType === 'express' ? 30 : 60;
    const slaDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);

    const id = await generateOrderId();

    const order = new Order({
      id,
      status: 'pending',
      riderId: riderId || null,
      etaMinutes: null,
      slaDeadline,
      pickupLocation: pickup,
      dropLocation: drop,
      zone: zone || null,
      customerName: name,
      items: itemList,
      timeline: [{
        status: 'pending',
        time: new Date(),
        note: 'Manual order created',
      }],
    });

    await order.save();

    let dispatched = false;
    if (riderId) {
      try {
        await assignOrder(id, riderId, true);
        dispatched = true;
      } catch (err) {
        logger.warn('Manual order created but dispatch failed', { orderId: id, riderId, err: err.message });
      }
    }

    return {
      orderId: id,
      status: dispatched ? 'assigned' : 'pending',
      riderId: dispatched ? riderId : null,
      message: dispatched ? 'Order created and dispatched to rider' : 'Order created successfully',
    };
  } catch (error) {
    logger.error('Error creating manual order:', error);
    throw error;
  }
};

/**
 * Get auto-assign rules
 */
const getAutoAssignRules = async () => {
  try {
    const rules = await AutoAssignRule.find({}).sort({ createdAt: 1 }).lean();
    if (rules.length === 0) {
      const defaultRule = {
        id: 'default',
        name: 'Default Rule',
        isActive: false,
        criteria: {
          maxRadiusKm: 5,
          maxOrdersPerRider: 3,
          preferSameZone: true,
          priorityWeight: 5,
          distanceWeight: 5,
          etaWeight: 5,
        },
        createdBy: 'system',
        updatedAt: new Date().toISOString(),
      };
      return [defaultRule];
    }
    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      criteria: r.criteria,
      createdBy: r.createdBy,
      updatedAt: r.updatedAt?.toISOString?.() || new Date(r.updatedAt).toISOString(),
    }));
  } catch (error) {
    logger.error('Error getting auto-assign rules:', error);
    throw error;
  }
};

/**
 * Update auto-assign rule (create if not exists)
 */
const updateAutoAssignRule = async (rule) => {
  try {
    const { id, name, isActive, criteria } = rule;
    const ruleId = id || 'default';

    const update = {
      name: name || 'Default Rule',
      isActive: isActive ?? false,
      criteria: criteria || {
        maxRadiusKm: 5,
        maxOrdersPerRider: 3,
        preferSameZone: true,
        priorityWeight: 5,
        distanceWeight: 5,
        etaWeight: 5,
      },
      updatedAt: new Date(),
    };

    const doc = await AutoAssignRule.findOneAndUpdate(
      { id: ruleId },
      {
        $set: update,
        $setOnInsert: { id: ruleId, createdBy: rule.createdBy || 'system' },
      },
      { upsert: true, new: true }
    ).lean();

    return {
      id: doc.id,
      name: doc.name,
      isActive: doc.isActive,
      criteria: doc.criteria,
      createdBy: doc.createdBy,
      updatedAt: doc.updatedAt?.toISOString?.() || new Date(doc.updatedAt).toISOString(),
    };
  } catch (error) {
    logger.error('Error updating auto-assign rule:', error);
    throw error;
  }
};

module.exports = {
  listUnassignedOrders,
  getUnassignedOrdersCount,
  getMapData,
  getMapRiders,
  getMapOrders,
  getRecommendedRiders,
  getOrderAssignmentDetails,
  assignOrder,
  batchAssignOrders,
  autoAssignOrders,
  createManualOrder,
  getAutoAssignRules,
  updateAutoAssignRule,
};
