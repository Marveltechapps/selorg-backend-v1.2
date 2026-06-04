const Order = require('../../warehouse/models/Order');
const Rider = require('../models/Rider');
const { Rider: RiderV2 } = require('../../rider_v2_backend/src/models/Rider');
const Cluster = require('../models/Cluster');
const AutoAssignRule = require('../models/AutoAssignRule');
const { calculateDistance } = require('../../utils/distanceCalculator');
const logger = require('../../core/utils/logger');

/**
 * Resolve order id from mixed-schema documents (Warehouse: id, Darkstore: order_id).
 */
function resolveOrderId(order) {
  if (!order) return null;
  return order.id || order.order_id || (order._id ? String(order._id) : null);
}

/**
 * Normalize mixed orders collection docs for dispatch APIs.
 */
function normalizeOrderForDispatch(order) {
  const id = resolveOrderId(order);
  const slaDeadline = order.slaDeadline || order.sla_deadline || null;
  const pickupLocation =
    order.pickupLocation ||
    order.pickup_location ||
    (order.store_id ? `Store ${order.store_id}` : null) ||
    'Default Warehouse';
  const dropLocation =
    order.dropLocation ||
    order.delivery_address ||
    (typeof order.delivery?.address === 'string' ? order.delivery.address : '') ||
    '';
  const customerName = order.customerName || order.customer_name || 'Customer';
  const riderId = order.riderId || order.assignee?.id || null;
  const zone = order.zone || order.store_id || null;

  let items = order.items;
  if (Array.isArray(items) && items.length > 0 && typeof items[0] === 'object') {
    items = items
      .map((i) => i?.productName || i?.sku || i?.productId || String(i))
      .filter(Boolean);
  }

  return {
    ...order,
    id,
    slaDeadline,
    pickupLocation,
    dropLocation,
    customerName,
    riderId,
    zone,
    items: items || [],
  };
}

/**
 * Calculate order priority based on SLA deadline
 * @param {Date} slaDeadline - SLA deadline
 * @returns {string} Priority level (high, medium, low)
 */
const calculatePriority = (slaDeadline) => {
  if (!slaDeadline) return 'medium';
  const deadline = slaDeadline instanceof Date ? slaDeadline : new Date(slaDeadline);
  if (Number.isNaN(deadline.getTime())) return 'medium';

  const now = new Date();
  const timeUntilDeadline = deadline - now;
  const minutesUntilDeadline = timeUntilDeadline / (1000 * 60);

  if (minutesUntilDeadline <= 30) {
    return 'high';
  } else if (minutesUntilDeadline <= 60) {
    return 'medium';
  }
  return 'low';
};

const DEFAULT_AUTO_ASSIGN_CRITERIA = {
  maxRadiusKm: 5,
  maxOrdersPerRider: 3,
  preferSameZone: true,
};

function normalizeAutoAssignCriteria(criteria = {}) {
  return {
    maxRadiusKm: Math.min(50, Math.max(0.5, Number(criteria.maxRadiusKm) || DEFAULT_AUTO_ASSIGN_CRITERIA.maxRadiusKm)),
    maxOrdersPerRider: Math.min(
      10,
      Math.max(1, Number(criteria.maxOrdersPerRider) || DEFAULT_AUTO_ASSIGN_CRITERIA.maxOrdersPerRider)
    ),
    preferSameZone: criteria.preferSameZone !== false,
  };
}

async function getStoredAutoAssignRule() {
  const rules = await AutoAssignRule.find({}).sort({ createdAt: 1 }).lean();
  return rules[0] || null;
}

async function getAutoAssignCriteria() {
  const rule = await getStoredAutoAssignRule();
  return normalizeAutoAssignCriteria(rule?.criteria);
}

async function isAutoAssignEnabled() {
  const rule = await getStoredAutoAssignRule();
  return Boolean(rule?.isActive);
}

function riderMeetsAutoAssignConstraints(rider, order, criteria) {
  if (rider.capacity.currentLoad >= criteria.maxOrdersPerRider) return false;
  if (rider.capacity.currentLoad >= rider.capacity.maxLoad) return false;

  if (criteria.preferSameZone && order.zone && rider.zone && rider.zone !== order.zone) {
    return false;
  }

  const pickup = extractCoordinates(order.pickupLocation);
  if (!rider.location || typeof rider.location.lat !== 'number' || typeof rider.location.lng !== 'number') {
    return false;
  }

  const distanceKm = calculateDistance(
    rider.location.lat,
    rider.location.lng,
    pickup.lat,
    pickup.lng
  );
  return distanceKm <= criteria.maxRadiusKm;
}

function scoreRiderForAutoAssign(rider, order, criteria) {
  const orderPickupCoords = extractCoordinates(order.pickupLocation);
  const orderPriority = calculatePriority(order.slaDeadline);
  let score = 0;

  if (!rider.location) return -Infinity;

  const distanceKm = calculateDistance(
    rider.location.lat,
    rider.location.lng,
    orderPickupCoords.lat,
    orderPickupCoords.lng
  );
  score -= distanceKm * 2;
  score -= Math.ceil(distanceKm * 3) * 0.5;

  if (criteria.preferSameZone && rider.zone && order.zone && rider.zone === order.zone) {
    score += 10;
  }

  const loadRatio = rider.capacity.currentLoad / Math.max(rider.capacity.maxLoad, 1);
  score -= loadRatio * 10;

  if (rider.status === 'online' || rider.status === 'idle') {
    score += 5;
  } else if (rider.status === 'busy') {
    score += 2;
  }

  score += (rider.rating || 0) * 2;
  if (orderPriority === 'high') score += 15;

  return score;
}

/**
 * Fallback distance from order id string when coordinates are unavailable.
 */
function calculateOrderDistanceFromId(orderId) {
  const idStr = orderId != null ? String(orderId) : '';
  const match = idStr.match(/\d+/);
  const num = match ? parseInt(match[0], 10) : 1000;
  return (num % 10) + 0.5;
}

/**
 * Distance in km: prefer pickup→drop coordinates; fallback to id-based estimate.
 * @param {object|string} orderOrId - Order document or id string
 */
const calculateOrderDistance = (orderOrId) => {
  if (typeof orderOrId === 'object' && orderOrId !== null) {
    const order = normalizeOrderForDispatch(orderOrId);
    const pickup = extractCoordinates(order.pickupLocation);
    const drop = extractDropCoordinates(order);
    if (isValidMapCoord(pickup.lat, pickup.lng) && isValidMapCoord(drop.lat, drop.lng)) {
      const km = calculateDistance(pickup.lat, pickup.lng, drop.lat, drop.lng);
      if (km > 0) return Math.round(km * 100) / 100;
    }
    return calculateOrderDistanceFromId(order.id);
  }
  return calculateOrderDistanceFromId(orderOrId);
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

    // Orders eligible for manual / auto assignment in dispatch queue
    const query = {
      status: {
        $in: [
          'pending',
          'new',
          'processing',
          'ready',
          'picking',
          'picked',
          'packed',
          'ready_for_dispatch',
        ],
      },
    };

    if (zone) {
      query.zone = zone;
    }

    if (search) {
      query.$or = [
        { id: { $regex: search, $options: 'i' } },
        { order_id: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customer_name: { $regex: search, $options: 'i' } },
      ];
    }

    // Exclude orders already assigned to a rider
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { riderId: null },
          { riderId: { $exists: false } },
          { riderId: '' },
        ],
      },
    ];

    // Get all unassigned orders (mixed Warehouse + Darkstore schemas in `orders`)
    let orders = await Order.find(query).lean();

    // Calculate priority, distance, and coordinates for each order
    orders = orders.map((rawOrder) => {
      const order = normalizeOrderForDispatch(rawOrder);
      const priorityLevel = calculatePriority(order.slaDeadline);
      const distance = calculateOrderDistance(order);
      const etaMinutes = Math.ceil(distance * 3); // Rough estimate: 3 minutes per km
      const pickupCoords = extractCoordinates(order.pickupLocation);
      const dropCoords = extractDropCoordinates(order);

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

    // Drop orders we cannot identify (no id / order_id)
    orders = orders.filter((order) => order.id);

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
          comparison = new Date(a.slaDeadline || 0) - new Date(b.slaDeadline || 0);
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
      let ridersData = riders.map((rider) => ({
        id: rider.id,
        name: rider.name,
        status: rider.status,
        location: rider.location || { lat: 0, lng: 0 },
        zone: rider.zone,
        capacity: rider.capacity,
        currentOrderId: rider.currentOrderId,
        avatarInitials: rider.avatarInitials,
      }));

      ridersData = await mergeRidersWithV2Locations(ridersData);
      result.riders = ridersData.filter((r) =>
        isValidMapCoord(r.location?.lat, r.location?.lng)
      );

      // Calculate rider status counts
      const riderStatusCounts = {};
      ridersData.forEach((rider) => {
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
      const orders = await Order.find({
        status: { $nin: ['delivered', 'cancelled'] },
      }).lean();
      result.orders = orders.map((rawOrder) => {
        const order = normalizeOrderForDispatch(rawOrder);
        const pickupCoords = extractCoordinates(order.pickupLocation);
        const dropCoords = extractDropCoordinates(order);

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
      }).filter((o) => o.id);

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
        const key = order.pickupLocation ?? '';
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

/** Fallback when addresses are missing or not geocoded — must match dashboard default region so map toggles don’t jump to another continent */
const DEFAULT_MAP_COORDS = { lat: 13.0827, lng: 80.2707 };

function isValidMapCoord(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function mapV2AvailabilityToLegacy(availability, status) {
  if (availability === 'busy') return 'busy';
  if (availability === 'available') return 'idle';
  if (status === 'active' || status === 'approved') return 'online';
  return 'offline';
}

/**
 * Overlay mobile-app GPS (RiderV2) onto legacy rider map rows and include v2-only riders.
 */
async function mergeRidersWithV2Locations(ridersData) {
  const v2Riders = await RiderV2.find({
    deletedAt: { $exists: false },
    status: { $nin: ['suspended', 'deleted', 'inactive'] },
    $or: [
      { status: { $in: ['active', 'approved'] } },
      { status: 'pending', isVerified: true },
      { availability: { $in: ['available', 'busy'] } },
    ],
  })
    .select('riderId name currentLocation availability status')
    .lean();

  const byId = new Map(ridersData.map((r) => [r.id, { ...r }]));

  for (const v2 of v2Riders) {
    const lat = v2?.currentLocation?.lat;
    const lng = v2?.currentLocation?.lng;
    const hasGps = isValidMapCoord(lat, lng);
    const legacyStatus = mapV2AvailabilityToLegacy(v2.availability, v2.status);
    const existing = byId.get(v2.riderId);

    if (existing) {
      if (hasGps) {
        existing.location = { lat, lng };
      }
      existing.name = v2.name || existing.name;
      if (!existing.status || existing.status === 'offline') {
        existing.status = legacyStatus;
      }
      byId.set(v2.riderId, existing);
    } else if (hasGps) {
      byId.set(v2.riderId, {
        id: v2.riderId,
        name: v2.name || v2.riderId,
        status: legacyStatus,
        location: { lat, lng },
        zone: null,
        capacity: { currentLoad: 0, maxLoad: 5 },
        currentOrderId: null,
        avatarInitials: (v2.name || 'R').slice(0, 2).toUpperCase(),
      });
    }
  }

  return Array.from(byId.values());
}

/**
 * Extract coordinates from address string (simplified - would need geocoding service).
 * Handles missing/legacy orders where pickup/drop strings are absent.
 */
const extractCoordinates = (address) => {
  const str = typeof address === 'string' ? address.trim() : '';
  if (!str) {
    return { ...DEFAULT_MAP_COORDS };
  }
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const lat = DEFAULT_MAP_COORDS.lat + (hash % 100) / 1000;
  const lng = DEFAULT_MAP_COORDS.lng + (hash % 200) / 1000;
  return { lat, lng };
};

/**
 * Drop location: prefer embedded delivery coordinates when present on the order document.
 */
const extractDropCoordinates = (order) => {
  const c = order?.delivery?.address?.coordinates;
  if (
    c &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    !Number.isNaN(c.lat) &&
    !Number.isNaN(c.lng)
  ) {
    return { lat: c.lat, lng: c.lng };
  }
  return extractCoordinates(order?.dropLocation ?? order?.delivery_address);
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

    let ridersData = riders.map((rider) => ({
      id: rider.id,
      name: rider.name,
      status: rider.status,
      location: rider.location || { lat: 0, lng: 0 },
      zone: rider.zone,
      capacity: rider.capacity,
      currentOrderId: rider.currentOrderId,
      avatarInitials: rider.avatarInitials,
    }));

    ridersData = await mergeRidersWithV2Locations(ridersData);

    // Calculate status counts
    const statusCounts = {};
    ridersData.forEach((rider) => {
      statusCounts[rider.status] = (statusCounts[rider.status] || 0) + 1;
    });

    return {
      riders: ridersData.filter((r) => isValidMapCoord(r.location?.lat, r.location?.lng)),
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

    const ordersData = orders.map((rawOrder) => {
      const order = normalizeOrderForDispatch(rawOrder);
      const pickupCoords = extractCoordinates(order.pickupLocation);
      const dropCoords = extractDropCoordinates(order);

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
    }).filter((o) => o.id);

    // Get pickup points
    const pickupMap = new Map();
    orders.forEach((order) => {
      const key = order.pickupLocation ?? '';
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

    // Get order (mixed schema: id or order_id)
    let order = await Order.findOne({ id: orderId }).lean();
    if (!order) {
      order = await Order.findOne({ order_id: orderId }).lean();
    }
    if (!order) {
      throw new Error('Order not found');
    }
    order = normalizeOrderForDispatch(order);

    // Get available riders:
    // - Must be online/idle (actively working and not offline)
    // - Must currently have no active order (free)
    // - Must have zero load and be under capacity
    let ridersQuery = {
      status: { $in: ['online', 'idle'] },
      currentOrderId: null,
      'capacity.currentLoad': { $eq: 0 },
      $expr: { $lt: ['$capacity.currentLoad', '$capacity.maxLoad'] },
    };

    if (search) {
      ridersQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
      ];
    }

    const riders = await Rider.find(ridersQuery).lean();
    const criteria = await getAutoAssignCriteria();
    const orderPickupCoords = extractCoordinates(order.pickupLocation);
    const orderPriority = calculatePriority(order.slaDeadline);

    const ridersWithScores = riders
      .filter((rider) => riderMeetsAutoAssignConstraints(rider, order, criteria))
      .map((rider) => {
        const score = scoreRiderForAutoAssign(rider, order, criteria);
        const distance = calculateDistance(
          rider.location.lat,
          rider.location.lng,
          orderPickupCoords.lat,
          orderPickupCoords.lng
        );
        const estimatedPickupMinutes = Math.ceil(distance * 3);

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
          distance,
          rating: rider.rating || 0,
          score,
          isRecommended: false,
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
        distance: calculateOrderDistance(order),
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
    let order = await Order.findOne({ id: orderId }).lean();
    if (!order) {
      order = await Order.findOne({ order_id: orderId }).lean();
    }
    if (!order) {
      throw new Error('Order not found');
    }
    order = normalizeOrderForDispatch(order);

    const priority = calculatePriority(order.slaDeadline);
    const distance = calculateOrderDistance(order);

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

    const assignableStatuses = [
      'pending', 'assigned', 'delayed', 'picked_up', 'in_transit',
      'new', 'processing', 'ready', 'picking', 'picked', 'packed', 'ready_for_dispatch',
    ];
    const normalizedStatus = String(order.status || '').toLowerCase();
    if (!assignableStatuses.includes(normalizedStatus)) {
      throw new Error(
        `Order cannot be assigned in current status (${order.status}). Allowed: ${assignableStatuses.join(', ')}`
      );
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
        status: {
          $in: [
            'pending',
            'new',
            'processing',
            'ready',
            'picking',
            'picked',
            'packed',
            'ready_for_dispatch',
          ],
        },
      }).lean();
    } else {
      unassignedOrders = await Order.find({
        status: {
          $in: [
            'pending',
            'new',
            'processing',
            'ready',
            'picking',
            'picked',
            'packed',
            'ready_for_dispatch',
          ],
        },
      })
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

    const criteria = await getAutoAssignCriteria();

    // Find available riders (under configured per-rider cap and model max load)
    const availableRiders = (await Rider.find({
      $expr: { $lt: ['$capacity.currentLoad', '$capacity.maxLoad'] },
    }).lean()).filter((r) => r.capacity.currentLoad < criteria.maxOrdersPerRider);

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

    // Assign orders using configured constraints + deterministic scoring
    for (const order of unassignedOrders) {
      let bestRider = null;
      let bestScore = -Infinity;

      for (const rider of availableRiders) {
        if (!riderMeetsAutoAssignConstraints(rider, order, criteria)) {
          continue;
        }

        const score = scoreRiderForAutoAssign(rider, order, criteria);
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
    const enabled = await isAutoAssignEnabled();
    if (!enabled) {
      return {
        assigned: 0,
        failed: 0,
        disabled: true,
        message: 'Auto-assign is disabled. Enable the rule in Auto-Assign Configuration.',
      };
    }

    const result = await batchAssignOrders(orderIds);
    return {
      assigned: result.assigned,
      failed: result.failed,
      disabled: false,
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
    const dropLocationText = typeof dropLocation === 'string'
      ? dropLocation.trim()
      : (dropLocation && typeof dropLocation === 'object'
        ? String(dropLocation.address || dropLocation.label || '').trim()
        : '');
    if (!dropLocationText) {
      throw new Error('Customer address (drop location) is required');
    }
    if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') {
      throw new Error('Customer name is required');
    }

    const pickupLocationText = typeof pickupLocation === 'string'
      ? pickupLocation.trim()
      : (pickupLocation && typeof pickupLocation === 'object'
        ? String(pickupLocation.address || pickupLocation.label || '').trim()
        : '');
    const pickup = pickupLocationText
      ? pickupLocationText
      : 'Default Warehouse';
    const drop = dropLocationText;
    const name = customerName.trim();
    const itemList = items
      .map((i) => (typeof i === 'string' ? i : (i?.name || i?.id || i?.skuId || String(i))))
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (itemList.length === 0) {
      throw new Error('Order must have at least one item');
    }

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
        criteria: { ...DEFAULT_AUTO_ASSIGN_CRITERIA },
        createdBy: 'system',
        updatedAt: new Date().toISOString(),
      };
      return [defaultRule];
    }
    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      criteria: normalizeAutoAssignCriteria(r.criteria),
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
      criteria: normalizeAutoAssignCriteria(criteria),
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

const GROUP_CLUSTER_COLORS = [
  '#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444',
  '#EC4899', '#F59E0B', '#06B6D4', '#6366F1', '#14B8A6',
];

const GROUP_DELIVERY_LIVE_STATUSES = [
  'pending', 'assigned', 'delayed', 'picked_up', 'in_transit',
  'new', 'processing', 'ready', 'picking', 'picked', 'packed', 'ready_for_dispatch',
  'ASSIGNED', 'PICKED',
];

const RIDER_EARNING_BASE_INR = 25;
const RIDER_EARNING_PER_KM_INR = 8;
const MINUTES_PER_KM_ESTIMATE = 3;
const MINUTES_PER_STOP_BUFFER = 5;

function calculateRiderEarning(rawOrder, distanceKm) {
  const fee =
    rawOrder?.deliveryFee ??
    rawOrder?.pricing?.deliveryFee ??
    rawOrder?.delivery_fee;
  if (fee != null && Number(fee) > 0) {
    return Math.round(Number(fee) * 100) / 100;
  }
  const km = distanceKm ?? calculateOrderDistance(rawOrder);
  return Math.round((RIDER_EARNING_BASE_INR + km * RIDER_EARNING_PER_KM_INR) * 100) / 100;
}

function enrichOrderForGroupDelivery(rawOrder) {
  const order = normalizeOrderForDispatch(rawOrder);
  const coordinates = extractDropCoordinates(rawOrder);
  const distanceKm = calculateOrderDistance(rawOrder);
  const etaMinutes = Math.ceil(distanceKm * MINUTES_PER_KM_ESTIMATE);
  const priority = calculatePriority(order.slaDeadline);
  const riderEarning = calculateRiderEarning(rawOrder, distanceKm);

  return {
    ...order,
    coordinates,
    distanceKm,
    etaMinutes,
    priority,
    riderEarning,
    zone: order.zone || null,
    status: order.status,
  };
}

async function getReservedGroupDeliveryOrderIds() {
  const activeClusterDocs = await Cluster.find({
    status: { $in: ['active', 'assigned'] },
  })
    .select('orderIds')
    .lean();
  return new Set(activeClusterDocs.flatMap((c) => c.orderIds || []).filter(Boolean));
}

function buildGroupDeliveryStatusQuery(statusFilter) {
  if (!statusFilter || statusFilter === 'all') {
    return { $in: GROUP_DELIVERY_LIVE_STATUSES };
  }
  return statusFilter;
}

async function fetchEligibleGroupDeliveryOrders(filters = {}) {
  const { status, zone, search } = filters;
  const query = { status: buildGroupDeliveryStatusQuery(status) };
  if (zone && zone !== 'all') {
    query.zone = zone;
  }

  const reservedOrderIds = await getReservedGroupDeliveryOrderIds();
  const orders = await Order.find(query).lean();

  let processed = orders
    .map((raw) => enrichOrderForGroupDelivery(raw))
    .filter(
      (o) =>
        o.id &&
        !reservedOrderIds.has(o.id) &&
        !o.riderId &&
        isValidMapCoord(o.coordinates?.lat, o.coordinates?.lng)
    );

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    processed = processed.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.dropLocation && String(o.dropLocation).toLowerCase().includes(q)) ||
        (o.zone && String(o.zone).toLowerCase().includes(q))
    );
  }

  return { orders: processed, reservedOrderCount: reservedOrderIds.size };
}

function computeRouteDistanceKm(orders) {
  if (!orders || orders.length === 0) return 0;
  if (orders.length === 1) {
    return orders[0].distanceKm ?? calculateOrderDistance(orders[0]);
  }

  const withCoords = orders.filter((o) =>
    isValidMapCoord(o.coordinates?.lat, o.coordinates?.lng)
  );
  if (withCoords.length < 2) {
    return Math.round(
      orders.reduce((sum, o) => sum + (o.distanceKm || calculateOrderDistance(o)), 0) * 100
    ) / 100;
  }

  const remaining = [...withCoords];
  const start = remaining.shift();
  let total = start.distanceKm || calculateOrderDistance(start);
  let current = start.coordinates;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistance(
        current.lat,
        current.lng,
        remaining[i].coordinates.lat,
        remaining[i].coordinates.lng
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    total += bestDist;
    current = remaining.splice(bestIdx, 1)[0].coordinates;
  }

  return Math.round(total * 100) / 100;
}

function computeSlaRiskLevel(orders, estimatedDeliveryMinutes) {
  if (!orders || orders.length === 0) return 'ok';
  let worst = 'ok';
  const now = Date.now();

  for (const o of orders) {
    const deadline = o.slaDeadline ? new Date(o.slaDeadline).getTime() : null;
    if (!deadline || Number.isNaN(deadline)) continue;
    const minsUntil = (deadline - now) / (1000 * 60);
    const buffer = estimatedDeliveryMinutes + 10;

    if (minsUntil <= 0 || minsUntil < buffer) {
      return 'high';
    }
    if (minsUntil < buffer + 15) {
      worst = worst === 'ok' ? 'medium' : worst;
    } else if (minsUntil < buffer + 30 && worst === 'ok') {
      worst = 'low';
    }
  }

  return worst;
}

const computeClusterMetrics = async (orderIds = []) => {
  const ids = [...new Set((orderIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return {
      orderCount: 0,
      totalDistanceKm: 0,
      estimatedDeliveryMinutes: 0,
      totalEarnings: 0,
      slaRisk: 'ok',
      slaRiskLabel: 'No orders',
      ordersAtRisk: 0,
    };
  }

  const rawOrders = await Order.find({ id: { $in: ids } }).lean();
  const orders = rawOrders.map((raw) => enrichOrderForGroupDelivery(raw));
  const foundIds = new Set(orders.map((o) => o.id));
  const missingCount = ids.filter((id) => !foundIds.has(id)).length;

  const totalDistanceKm = computeRouteDistanceKm(orders);
  const stopBuffer = orders.length * MINUTES_PER_STOP_BUFFER;
  const travelMinutes = Math.ceil(totalDistanceKm * MINUTES_PER_KM_ESTIMATE);
  const estimatedDeliveryMinutes = travelMinutes + stopBuffer;
  const totalEarnings = Math.round(
    orders.reduce((sum, o) => sum + (o.riderEarning || 0), 0) * 100
  ) / 100;
  const slaRisk = computeSlaRiskLevel(orders, estimatedDeliveryMinutes);
  const now = Date.now();
  const ordersAtRisk = orders.filter((o) => {
    const deadline = o.slaDeadline ? new Date(o.slaDeadline).getTime() : null;
    if (!deadline) return false;
    const minsUntil = (deadline - now) / (1000 * 60);
    return minsUntil < estimatedDeliveryMinutes + 10;
  }).length;

  const slaRiskLabels = {
    high: 'High risk — SLA likely breached',
    medium: 'Medium risk — tight SLA window',
    low: 'Low risk — monitor SLA',
    ok: 'On track for SLA',
  };

  return {
    orderCount: orders.length,
    totalDistanceKm,
    estimatedDeliveryMinutes,
    totalEarnings,
    slaRisk,
    slaRiskLabel: slaRiskLabels[slaRisk] || slaRiskLabels.ok,
    ordersAtRisk,
    missingOrderCount: missingCount,
    perOrder: orders.map((o) => ({
      id: o.id,
      distanceKm: o.distanceKm,
      riderEarning: o.riderEarning,
      etaMinutes: o.etaMinutes,
      priority: o.priority,
      zone: o.zone,
      status: o.status,
    })),
  };
};

const listGroupDeliveryOrders = async (filters = {}) => {
  const { orders, reservedOrderCount } = await fetchEligibleGroupDeliveryOrders(filters);
  return {
    orders,
    total: orders.length,
    reservedOrderCount,
  };
};

const getGroupDeliveryFilterOptions = async () => {
  const reservedOrderIds = await getReservedGroupDeliveryOrderIds();
  const orders = await Order.find({
    status: { $in: GROUP_DELIVERY_LIVE_STATUSES },
    id: { $exists: true },
  })
    .select('zone status id riderId')
    .lean();

  const zones = new Set();
  const statuses = new Set();
  for (const raw of orders) {
    const id = resolveOrderId(raw);
    if (!id || reservedOrderIds.has(id) || raw.riderId) continue;
    if (raw.zone) zones.add(String(raw.zone).trim());
    if (raw.status) statuses.add(String(raw.status).trim());
  }

  return {
    zones: Array.from(zones).sort(),
    statuses: Array.from(statuses).sort(),
  };
};

const updateClusterOrders = async (clusterId, orderIds) => {
  const cluster = await Cluster.findOne({ clusterId });
  if (!cluster) throw new Error('Cluster not found');
  if (cluster.status === 'assigned') {
    throw new Error('Cannot modify an assigned group');
  }

  const ids = [...new Set((orderIds || []).filter(Boolean))];
  if (ids.length > 10) throw new Error('A group can have at most 10 orders');

  const rawOrders = await Order.find({ id: { $in: ids } }).lean();
  const orders = rawOrders.map((raw) => enrichOrderForGroupDelivery(raw));
  if (orders.length !== ids.length) {
    throw new Error('One or more orders were not found');
  }

  const withCoords = orders.filter((o) => isValidMapCoord(o.coordinates?.lat, o.coordinates?.lng));
  let center = cluster.center;
  if (withCoords.length > 0) {
    center = {
      lat: withCoords.reduce((s, o) => s + o.coordinates.lat, 0) / withCoords.length,
      lng: withCoords.reduce((s, o) => s + o.coordinates.lng, 0) / withCoords.length,
    };
  }

  cluster.orderIds = ids;
  cluster.center = center;
  cluster.zone = orders[0]?.zone || cluster.zone;
  await cluster.save();

  return {
    clusterId: cluster.clusterId,
    orderIds: ids,
    center,
    orders,
  };
};

/**
 * Group orders into clusters based on distance (radius in km).
 * Orders already in active/assigned clusters or assigned to a rider are excluded.
 */
const groupOrders = async (filters = {}) => {
  try {
    const {
      status,
      zone,
      search,
      radius = 2,
      minSize = 2,
      maxSize = 10,
    } = filters;

    const radiusKm = Math.min(50, Math.max(0.05, Number(radius) || 2));

    const { orders: processedOrders, reservedOrderCount } = await fetchEligibleGroupDeliveryOrders({
      status,
      zone,
      search,
    });

    if (processedOrders.length === 0) {
      return {
        clusters: [],
        unclustered: [],
        radiusKm,
        totalOrders: 0,
        clusteredCount: 0,
        unclusteredCount: 0,
        reservedOrderCount,
      };
    }

    const unassigned = [...processedOrders];
    unassigned.sort(
      (a, b) =>
        (a.coordinates.lat - b.coordinates.lat) ||
        (a.coordinates.lng - b.coordinates.lng)
    );

    const clusters = [];
    let clusterIdCounter = 1;

    while (unassigned.length > 0) {
      const seed = unassigned.shift();
      const clusterOrders = [seed];

      for (let i = 0; i < unassigned.length && clusterOrders.length < maxSize; i++) {
        const other = unassigned[i];
        const dist = calculateDistance(
          seed.coordinates.lat,
          seed.coordinates.lng,
          other.coordinates.lat,
          other.coordinates.lng
        );

        if (dist <= radiusKm) {
          clusterOrders.push(other);
          unassigned.splice(i, 1);
          i--;
        }
      }

      if (clusterOrders.length >= minSize) {
        const avgLat =
          clusterOrders.reduce((sum, o) => sum + o.coordinates.lat, 0) / clusterOrders.length;
        const avgLng =
          clusterOrders.reduce((sum, o) => sum + o.coordinates.lng, 0) / clusterOrders.length;

        clusters.push({
          id: `draft-${clusterIdCounter}`,
          orders: clusterOrders.map((o) => ({
            ...o,
            coordinates: o.coordinates,
          })),
          center: { lat: avgLat, lng: avgLng },
          orderCount: clusterOrders.length,
          color: GROUP_CLUSTER_COLORS[(clusters.length) % GROUP_CLUSTER_COLORS.length],
          radiusKm,
        });
        clusterIdCounter += 1;
      }
    }

    const clusteredOrderIds = new Set(clusters.flatMap((c) => c.orders.map((o) => o.id)));
    const unclustered = processedOrders
      .filter((o) => !clusteredOrderIds.has(o.id))
      .map((o) => ({ ...o, coordinates: o.coordinates }));

    return {
      clusters,
      unclustered,
      radiusKm,
      totalOrders: processedOrders.length,
      clusteredCount: clusteredOrderIds.size,
      unclusteredCount: unclustered.length,
      reservedOrderCount,
    };
  } catch (error) {
    logger.error('Error grouping orders:', error);
    throw error;
  }
};

/**
 * Save clusters to backend
 */
const saveClusters = async (clustersData) => {
  try {
    const savedClusters = [];
    
    for (const data of clustersData) {
      const rawId = data.clusterId || data.id;
      const clusterId =
        rawId && !String(rawId).startsWith('draft-')
          ? String(rawId)
          : `CL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const orderIds = (data.orders || []).map((o) => o.id).filter(Boolean);
      if (orderIds.length === 0) continue;

      const radiusKm =
        data.radiusKm != null
          ? Number(data.radiusKm)
          : data.metadata?.radiusKm != null
            ? Number(data.metadata.radiusKm)
            : undefined;

      const cluster = await Cluster.findOneAndUpdate(
        { clusterId },
        {
          clusterId,
          orderIds,
          center: data.center,
          color: data.color || '#F97316',
          zone: data.orders[0]?.zone || null,
          status: 'active',
          metadata: {
            ...(data.metadata || {}),
            ...(radiusKm != null && !Number.isNaN(radiusKm) ? { radiusKm } : {}),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      savedClusters.push(cluster);
    }
    
    return savedClusters;
  } catch (error) {
    logger.error('Error saving clusters:', error);
    throw error;
  }
};

/**
 * List active clusters
 */
const listClusters = async (filters = {}) => {
  try {
    const query = { status: filters.status || 'active' };
    if (filters.zone) query.zone = filters.zone;
    
    const clusters = await Cluster.find(query).sort({ createdAt: -1 }).lean();
    
    // Populate order details for each cluster
    const result = await Promise.all(clusters.map(async (cluster) => {
      const orders = await Order.find({ id: { $in: cluster.orderIds } }).lean();
      
      // Add coordinates to orders
      const processedOrders = orders.map((order) => enrichOrderForGroupDelivery(order));

      return {
        ...cluster,
        orders: processedOrders,
        radiusKm: cluster.metadata?.radiusKm,
      };
    }));
    
    return result;
  } catch (error) {
    logger.error('Error listing clusters:', error);
    throw error;
  }
};

/**
 * Delete a cluster
 */
const deleteCluster = async (clusterId) => {
  try {
    const result = await Cluster.deleteOne({ clusterId });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Error deleting cluster:', error);
    throw error;
  }
};

/**
 * Assign a cluster to a rider
 */
const assignClusterToRider = async (clusterId, riderId, options = {}) => {
  try {
    const { overrideSla = false } = options;
    const cluster = await Cluster.findOne({ clusterId });
    if (!cluster) throw new Error('Cluster not found');

    if (cluster.status === 'assigned' && cluster.riderId && cluster.riderId !== riderId) {
      throw new Error('Cluster is already assigned to another rider');
    }

    const rider = await Rider.findOne({ id: riderId });
    if (!rider) throw new Error('Rider not found');

    const orderIds = cluster.orderIds || [];
    if (orderIds.length === 0) throw new Error('Cluster has no orders');

    const spare = (rider.capacity?.maxLoad ?? 5) - (rider.capacity?.currentLoad ?? 0);
    if (spare < orderIds.length) {
      throw new Error(
        `Rider ${rider.name} has capacity for ${Math.max(0, spare)} more order(s), but group has ${orderIds.length}`
      );
    }

    const assigned = [];
    const failed = [];
    for (const orderId of orderIds) {
      try {
        const res = await assignOrder(orderId, riderId, overrideSla);
        assigned.push({ orderId, ...res });
      } catch (err) {
        failed.push({ orderId, message: err.message || 'Assignment failed' });
        logger.warn(`Failed to assign order ${orderId} in cluster ${clusterId}:`, err.message);
      }
    }

    if (assigned.length === 0) {
      throw new Error(failed[0]?.message || 'No orders could be assigned');
    }

    cluster.status = failed.length === 0 ? 'assigned' : 'active';
    cluster.riderId = riderId;
    await cluster.save();

    return {
      success: true,
      clusterId,
      riderId,
      riderName: rider.name,
      assignedCount: assigned.length,
      failedCount: failed.length,
      totalOrders: orderIds.length,
      assigned,
      failed,
    };
  } catch (error) {
    logger.error('Error assigning cluster to rider:', error);
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
  groupOrders,
  listGroupDeliveryOrders,
  getGroupDeliveryFilterOptions,
  computeClusterMetrics,
  updateClusterOrders,
  saveClusters,
  listClusters,
  deleteCluster,
  assignClusterToRider,
};
