const path = require('path');
const mongoose = require('mongoose');
const Order = require('../models/Order');
// CRITICAL: Use RiderOperational (riders collection, string id) for warehouse assignments.
// ProductionRider/DarkstoreRider use rider_id, store_id, last_update, ObjectId _id - incompatible.
// Use direct module export to avoid mongoose.model() resolution picking wrong schema.
const Rider = require(path.resolve(__dirname, '../../rider/models/Rider.js'));
// RiderV2 profile (riders_v2 collection) is the source of truth for
// mobile riders like RDR-ADY-2603-001. We use it as a fallback to
// hydrate the legacy Rider collection when needed for assignments.
const { Rider: RiderV2 } = require('../../rider_v2_backend/src/models/Rider');
const { Order: RiderV2Order } = require('../../rider_v2_backend/src/models/Order');

// Runtime check: RiderOperational has 'id' field; ProductionRider/DarkstoreRider have 'rider_id'
if (!Rider || !Rider.schema.paths.id || Rider.schema.paths.rider_id) {
  throw new Error(
    'orderService: RiderOperational model not available. ' +
    'Expected riders collection with string id field.'
  );
}
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
  // Use raw collection to find order - 'orders' collection has mixed schemas (WarehouseOrder
  // vs DarkstoreOrder). Darkstore uses order_id; Warehouse uses id. Avoid loading as Mongoose
  // document to prevent validation failures on save (items as objects, timeline.ASSIGNED, etc).
  const ordersColl = mongoose.connection.collection('orders');
  const orderDoc = await ordersColl.findOne({ $or: [{ id: orderId }, { order_id: orderId }] });
  if (!orderDoc) {
    const error = new Error(`Order ${orderId} not found in database`);
    error.statusCode = 404;
    throw error;
  }

  let rider = await Rider.findOne({ id: riderId });
  let effectiveRiderId = riderId;

  // If riderId looks like a phone number (e.g. 7418268091), resolve to RiderV2.riderId
  // so RiderV2Order sync and rider app list API match (rider app uses JWT sub = riderId).
  if (!rider && /^\d{10}$/.test(String(riderId).trim())) {
    const v2ByPhone = await RiderV2.findOne({ phoneNumber: String(riderId).trim() }).lean();
    if (v2ByPhone && v2ByPhone.riderId) {
      effectiveRiderId = v2ByPhone.riderId;
      rider = await Rider.findOne({ id: effectiveRiderId });
    }
  }

  // When the legacy Rider document is missing (common for new RiderV2 profiles),
  // create an operational Rider document from riders_v2 so that dashboard
  // assignments work and we can persist capacity/status updates.
  if (!rider) {
    const v2 = await RiderV2.findOne({ riderId: effectiveRiderId }).lean();

    if (v2) {
      const name = v2.name || v2.phoneNumber || effectiveRiderId;
      const avatarInitials =
        (name || '')
          .split(' ')
          .filter(Boolean)
          .map((p) => p[0])
          .join('')
          .slice(0, 3)
          .toUpperCase() || 'R';

      const availability = v2.availability || 'offline'; // available | busy | offline
      const statusMap = {
        available: 'online',
        busy: 'busy',
        offline: 'offline',
      };
      const mappedStatus = statusMap[availability] || 'offline';

      const locationSource = v2.currentLocation || v2.preferredLocation || {};
      const location =
        locationSource && typeof locationSource === 'object'
          ? {
              lat: typeof locationSource.lat === 'number' ? locationSource.lat : locationSource.latitude || 0,
              lng: typeof locationSource.lng === 'number' ? locationSource.lng : locationSource.longitude || 0,
            }
          : null;

      // Create operational Rider document for assignment persistence (RiderOperational schema
      // uses string `id` field, not ObjectId _id, so RDR-ADY-2603-001 format works)
      rider = new Rider({
        id: effectiveRiderId,
        name,
        avatarInitials,
        status: mappedStatus,
        currentOrderId: null,
        location: location && (location.lat !== 0 || location.lng !== 0) ? location : null,
        capacity: {
          currentLoad: 0,
          maxLoad: 5,
        },
        avgEtaMins: 0,
        rating: (v2.stats && v2.stats.averageRating) || 0,
        zone:
          (v2.preferredLocation && v2.preferredLocation.hubName) ||
          v2.preferredLocation?.cityName ||
          null,
      });
      try {
        await rider.save();
      } catch (saveErr) {
        if (saveErr.code === 11000) {
          rider = await Rider.findOne({ id: effectiveRiderId });
        } else {
          throw saveErr;
        }
      }
    }

    if (!rider) {
      const error = new Error(`Rider ${riderId} not found in database`);
      error.statusCode = 404;
      throw error;
    }
  }

  // Validation checks - allow assign/reassign for pre-assignment and in-progress statuses
  // Warehouse: pending, assigned, delayed, picked_up, in_transit
  // Darkstore: new, processing, ready (pre-assign) + ASSIGNED, PICKING, PICKED, PACKED, READY_FOR_DISPATCH
  const assignableStatuses = [
    'pending', 'assigned', 'delayed', 'picked_up', 'in_transit',
    'new', 'processing', 'ready', 'picking', 'picked', 'packed', 'ready_for_dispatch',
  ];
  const orderStatus = orderDoc.status;
  const normalizedStatus = (orderStatus || '').toLowerCase();
  if (!assignableStatuses.includes(normalizedStatus)) {
    const error = new Error(`Order cannot be assigned in current status (${orderStatus}). Allowed: ${assignableStatuses.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  // Resolve riderId from order (Warehouse: riderId, Darkstore: assignee.id)
  const existingRiderId = orderDoc.riderId || (orderDoc.assignee && orderDoc.assignee.id) || null;

  // Handle reassignment: if order is already assigned to a different rider, update previous rider
  let previousRider = null;
  const isReassignment = existingRiderId && existingRiderId !== effectiveRiderId;
  
  if (isReassignment) {
    previousRider = await Rider.findOne({ id: existingRiderId });
    if (previousRider) {
      // Decrease previous rider's load
      if (previousRider.capacity && previousRider.capacity.currentLoad > 0) {
        previousRider.capacity.currentLoad = Math.max(0, previousRider.capacity.currentLoad - 1);
      }
      
      // Update previous rider's status if they have no more orders
      if (previousRider.capacity.currentLoad === 0) {
        // Check if rider has any other assigned orders
        const otherOrders = await ordersColl.countDocuments({
          $and: [
            { $or: [{ riderId: previousRider.id }, { 'assignee.id': previousRider.id }] },
            { $nor: [{ id: orderId }, { order_id: orderId }] },
            { status: { $in: ['assigned', 'picked_up', 'in_transit', 'ASSIGNED', 'PICKED', 'PICKING', 'READY_FOR_DISPATCH'] } },
          ],
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
  const dropLocation = orderDoc.dropLocation || orderDoc.delivery_address;
  let etaMinutes = null;
  if (rider.location && dropLocation) {
    etaMinutes = 15; // Default estimate
  }

  // SLA validation (Warehouse: slaDeadline, Darkstore: sla_deadline)
  const slaDeadline = orderDoc.slaDeadline || orderDoc.sla_deadline;
  if (!overrideSla && etaMinutes && slaDeadline) {
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + etaMinutes);
    if (estimatedDeliveryTime > new Date(slaDeadline)) {
      const error = new Error('Assignment would violate SLA deadline');
      error.statusCode = 400;
      throw error;
    }
  }

  const etaMins = etaMinutes || 15;
  const timelineNote = isReassignment && previousRider
    ? `Reassigned from ${previousRider.name} to ${rider.name}`
    : `Assigned to ${rider.name}`;

  // Update order via raw collection to avoid Mongoose validation (mixed Warehouse/Darkstore schemas)
  // Darkstore uses ASSIGNED (uppercase); Warehouse uses assigned (lowercase)
  const statusValue = orderDoc.store_id ? 'ASSIGNED' : 'assigned';
  const orderUpdate = {
    $set: {
      status: statusValue,
      riderId: effectiveRiderId,
      etaMinutes: etaMins,
      // Darkstore uses assignee; set both for compatibility
      'assignee.id': effectiveRiderId,
      'assignee.name': rider.name,
      'assignee.initials': (rider.avatarInitials || rider.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()) || 'R',
    },
    $push: {
      timeline: {
        status: 'assigned',
        time: new Date(),
        note: timelineNote,
        // Darkstore timeline uses timestamp
        timestamp: new Date(),
        updatedBy: '',
        updatedByRole: '',
      },
    },
  };

  // Update rider
  if (rider.status === 'idle' || rider.status === 'online') {
    rider.status = 'busy';
  }
  rider.currentOrderId = orderId;
  if (!rider.capacity) rider.capacity = { currentLoad: 0, maxLoad: 5 };
  rider.capacity.currentLoad = (rider.capacity.currentLoad || 0) + 1;

  try {
    const orderFilter = { $or: [{ id: orderId }, { order_id: orderId }] };
    const [orderResult] = await Promise.all([
      ordersColl.updateOne(orderFilter, orderUpdate),
      rider.save(),
      previousRider ? previousRider.save() : Promise.resolve(),
    ]);

    if (orderResult.modifiedCount === 0 && orderResult.matchedCount === 0) {
      throw new Error(`Order ${orderId} not found for update`);
    }
  } catch (saveError) {
    logger.error('Error saving order/rider assignment:', saveError);
    throw new Error(`Failed to save assignment: ${saveError.message}`);
  }

  // Sync to RiderV2Order so rider app list API returns this order, and push WebSocket for real-time update
  try {
    const orderIdVal = String(orderDoc.id || orderDoc.order_id || orderId);
    const pickupRaw = orderDoc.pickupLocation || orderDoc.store_id || 'Hub';
    const dropRaw = orderDoc.dropLocation || orderDoc.delivery_address || '';
    const zoneVal = orderDoc.zone || '';

    // Extract strings from pickup/drop (warehouse/darkstore may use objects)
    const darkstoreCode = typeof pickupRaw === 'string'
      ? pickupRaw
      : (pickupRaw && typeof pickupRaw === 'object' && (pickupRaw.address || pickupRaw.addressLine1 || pickupRaw.store_id))
        ? String(pickupRaw.address || pickupRaw.addressLine1 || pickupRaw.store_id || 'Hub')
        : 'Hub';
    const dropStr = typeof dropRaw === 'string'
      ? dropRaw
      : (dropRaw && typeof dropRaw === 'object' && (dropRaw.address || dropRaw.addressLine1 || dropRaw.delivery_address))
        ? String(dropRaw.address || dropRaw.addressLine1 || dropRaw.delivery_address || '')
        : '';
    const addressLine1 = (dropStr && dropStr.trim()) ? dropStr.trim() : 'Delivery address';
    const cityStr = (zoneVal && typeof zoneVal === 'string') ? zoneVal.trim() : '';

    const customerPhoneNumber = (orderDoc.customer_phone && String(orderDoc.customer_phone).trim())
      ? String(orderDoc.customer_phone).trim()
      : '0000000000'; // RiderV2Order requires non-empty; use placeholder when missing

    const rawItems = orderDoc.items || [];
    const itemsForRiderV2 = Array.isArray(rawItems)
      ? rawItems.map((it, i) => {
          const isObj = it && typeof it === 'object';
          return {
            skuId: isObj ? (it.skuId || it.productName || `item-${i}`) : String(it || `item-${i}`),
            productName: isObj ? (it.productName || it.name || '') : String(it || ''),
            quantity: isObj ? (it.quantity || 1) : 1,
            unit: isObj ? (it.unit || 'pc') : 'pc',
            pricePerUnit: isObj ? (it.pricePerUnit || it.price || 0) : 0,
            totalPrice: isObj ? (it.totalPrice || (it.price || 0) * (it.quantity || 1)) : 0,
          };
        })
      : [{ skuId: 'item-0', productName: 'Order item', quantity: 1, unit: 'pc', pricePerUnit: 0, totalPrice: 0 }];
    if (itemsForRiderV2.length === 0) {
      itemsForRiderV2.push({ skuId: 'item-0', productName: 'Order item', quantity: 1, unit: 'pc', pricePerUnit: 0, totalPrice: 0 });
    }

    const riderAssignment = { riderId: effectiveRiderId, assignedAt: new Date() };
    const scheduledTimeRaw = orderDoc.delivery?.scheduledTime || orderDoc.scheduled_time || orderDoc.scheduledTime;
    const scheduledTime = scheduledTimeRaw ? new Date(scheduledTimeRaw) : null;
    const deliverySlot = orderDoc.delivery?.slot || orderDoc.delivery_slot || 'asap';
    const metadata = { etaMinutes: etaMins, estimatedDistanceKm: Math.round((etaMins / 4) * 10) / 10 };

    const existing = await RiderV2Order.findOne({ orderNumber: orderIdVal }).lean();
    if (existing) {
      const updatePayload = {
        status: 'assigned',
        riderAssignment,
        'metadata.etaMinutes': etaMins,
        'metadata.estimatedDistanceKm': metadata.estimatedDistanceKm,
      };
      if (scheduledTime) updatePayload['delivery.scheduledTime'] = scheduledTime;
      if (deliverySlot) updatePayload['delivery.slot'] = deliverySlot;
      const updateResult = await RiderV2Order.updateOne(
        { orderNumber: orderIdVal },
        { $set: updatePayload }
      );
      logger.info('[RiderV2Order] Updated existing order', {
        orderNumber: orderIdVal,
        riderId: effectiveRiderId,
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
      });
    } else {
      const deliveryPayload = {
        address: {
          addressLine1,
          city: cityStr || 'NA',
          state: 'NA',
          pincode: 'NA',
        },
        slot: deliverySlot || 'asap',
      };
      if (scheduledTime) deliveryPayload.scheduledTime = scheduledTime;

      await RiderV2Order.create({
        orderNumber: orderIdVal,
        customerPhoneNumber,
        darkstoreCode,
        items: itemsForRiderV2,
        delivery: deliveryPayload,
        payment: { method: 'cod', status: 'pending', amount: 0 },
        pricing: { subtotal: 0, deliveryFee: 0, discount: 0, tax: 0, total: 0 },
        status: 'assigned',
        riderAssignment,
        metadata,
      });
      logger.info('[RiderV2Order] Created new order', { orderNumber: orderIdVal, riderId: effectiveRiderId });
    }

    const riderCacheHelper = require('../../rider_v2_backend/src/utils/riderCacheHelper.js');
    if (riderCacheHelper && typeof riderCacheHelper.invalidateOrdersForRider === 'function') {
      await riderCacheHelper.invalidateOrdersForRider();
    }

    const webSocketService = require('../../rider_v2_backend/src/modules/websocket/websocket.service.js').webSocketService;
    if (webSocketService && typeof webSocketService.notifyOrderAssignment === 'function') {
      webSocketService.notifyOrderAssignment(effectiveRiderId, {
        orderId: orderIdVal,
        orderNumber: orderIdVal,
        riderId: effectiveRiderId,
        status: 'assigned',
        etaMinutes: etaMins,
      });
    }
  } catch (syncErr) {
    logger.error('[RiderV2Order] Sync failed - rider app will not see this order', {
      orderId: orderDoc.id || orderDoc.order_id || orderId,
      riderId: effectiveRiderId,
      error: syncErr.message,
      stack: syncErr.stack,
    });
  }

  // Build response from orderDoc + updates (schema-agnostic)
  const orderIdVal = orderDoc.id || orderDoc.order_id || orderId;
  const baseTimeline = orderDoc.timeline || [];
  const newTimelineEntry = { status: 'assigned', time: new Date(), note: timelineNote };
  const responseOrder = {
    id: orderIdVal,
    status: 'assigned',
    riderId: effectiveRiderId,
    etaMinutes: etaMins,
    slaDeadline: slaDeadline || orderDoc.slaDeadline || orderDoc.sla_deadline,
    pickupLocation: orderDoc.pickupLocation || orderDoc.store_id || null,
    dropLocation: orderDoc.dropLocation || orderDoc.delivery_address || null,
    customerName: orderDoc.customerName || orderDoc.customer_name || null,
    items: orderDoc.items || [],
    timeline: [...baseTimeline, newTimelineEntry],
    zone: orderDoc.zone || null,
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

