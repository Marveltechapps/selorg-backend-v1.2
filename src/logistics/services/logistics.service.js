'use strict';

const mongoose = require('mongoose');
const LogisticsOrder = require('../models/logisticsOrder.model');
const ProviderOrder = require('../models/providerOrder.model');
const OrderStatusHistory = require('../models/orderStatusHistory.model');
const LogisticsProviderConfig = require('../models/logisticsProviderConfig.model');
const { getProviderAdapter } = require('../factory/providerFactory');
const providerConfig = require('./providerConfig.service');
const { canTransition } = require('../utils/stateMachine');
const { StateTransitionError, ProviderError, LogisticsError } = require('../utils/errors');
const { buildEnvelope } = require('./orderEventEnvelope');
const { publishOrderEvent } = require('../events/producers/orderEvent.producer');
const logger = require('../utils/logger');

async function appendHistory(orderId, status, message, source, location) {
  await OrderStatusHistory.create({
    logisticsOrderId: orderId,
    status,
    message: message || '',
    source: source || 'INTERNAL',
    eventTime: new Date(),
    location,
  });
}

async function getOrderedProviderNames() {
  await providerConfig.ensureDefaultConfigs();
  const rows = await LogisticsProviderConfig.find({ isActive: true }).sort({ priority: 1 }).select('name').lean();
  if (!rows.length) return ['PORTER'];
  return rows.map((r) => r.name);
}

async function tryProvidersWithFailover(orderPayload) {
  const names = await getOrderedProviderNames();
  const errors = [];
  for (const name of names) {
    const adapter = getProviderAdapter(name);
    try {
      const result = await adapter.createOrder({ ...orderPayload, provider: name });
      return { providerName: name, adapter, result };
    } catch (e) {
      logger.warn('[logistics] provider attempt failed', { provider: name, error: e.message });
      errors.push({ name, error: e.message, code: e.code });
    }
  }
  throw new ProviderError('All active logistics providers failed', { details: errors });
}

function routingKeyForStatus(status) {
  const map = {
    CREATED: 'order.created',
    DRIVER_ASSIGNED: 'order.driver_assigned',
    PICKED_UP: 'order.picked_up',
    IN_TRANSIT: 'order.in_transit',
    DELIVERED: 'order.delivered',
    CANCELLED: 'order.cancelled',
    FAILED: 'order.failed',
  };
  return map[status] || 'order.created';
}

async function emitStatus(order, status, extra = {}) {
  const eventType = routingKeyForStatus(status);
  const envelope = buildEnvelope(eventType, {
    logisticsOrderId: order._id.toString(),
    referenceId: order.referenceId,
    status,
    provider: order.provider,
    type: order.type,
    ...extra,
  });
  await publishOrderEvent(envelope);
}

async function createOrder(body, opts = {}) {
  const enforcedType = opts.enforcedType;
  const payload = { ...body };
  if (enforcedType) payload.type = enforcedType;

  const order = await LogisticsOrder.create({
    referenceId: payload.referenceId,
    type: payload.type,
    provider: payload.provider,
    pickup: payload.pickup,
    drop: payload.drop,
    items: payload.items,
    vehicleType: payload.vehicleType || 'mini_truck',
    scheduledTime: payload.scheduledTime,
    status: 'CREATED',
  });

  await appendHistory(order._id, 'CREATED', 'Order created', 'INTERNAL');

  try {
    const { providerName, result } = await tryProvidersWithFailover(payload);

    order.provider = providerName;
    order.providerOrderId = result.providerOrderId;
    order.estimatedFare = result.estimatedFare;
    order.distanceKm = result.distanceKm;
    order.status = result.status || 'CREATED';
    if (order.status === 'DRIVER_ASSIGNED') order.assignedAt = new Date();
    await order.save();

    await ProviderOrder.create({
      logisticsOrderId: order._id,
      provider: providerName,
      providerOrderId: result.providerOrderId,
      rawRequest: result.rawRequest,
      rawResponse: result.rawResponse,
      status: order.status,
    });

    if (order.status !== 'CREATED') {
      await appendHistory(order._id, order.status, 'Provider response', 'INTERNAL');
    }

    await emitStatus(order, 'CREATED', { initialProviderStatus: result.status });
    if (order.status !== 'CREATED') {
      await emitStatus(order, order.status, {});
    }

    return order;
  } catch (err) {
    order.status = 'FAILED';
    await order.save();
    await appendHistory(order._id, 'FAILED', err.message || 'Provider failure', 'INTERNAL');
    await emitStatus(order, 'FAILED', { error: err.message });
    throw err instanceof ProviderError ? err : new ProviderError(err.message || 'Create failed');
  }
}

async function listOrders(query, opts = {}) {
  const {
    status,
    provider,
    type,
    referenceId,
    from,
    to,
    page = 1,
    limit = 20,
  } = query;
  const filter = {};
  if (opts.enforcedType) filter.type = opts.enforcedType;
  if (status) filter.status = status;
  if (provider) filter.provider = provider;
  if (!opts.enforcedType && type) filter.type = type;
  if (referenceId) filter.referenceId = new RegExp(referenceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    LogisticsOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LogisticsOrder.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

async function getOrderById(id, opts = {}) {
  if (!mongoose.isValidObjectId(id)) {
    throw new LogisticsError('Invalid order id', 400, 'INVALID_ID');
  }
  const order = await LogisticsOrder.findById(id).lean();
  if (!order) throw new LogisticsError('Order not found', 404, 'NOT_FOUND');
  if (opts.enforcedType && order.type !== opts.enforcedType) {
    throw new LogisticsError('Order not in scope', 403, 'FORBIDDEN_SCOPE');
  }
  const history = await OrderStatusHistory.find({ logisticsOrderId: id }).sort({ eventTime: 1 }).lean();
  const audits = await ProviderOrder.find({ logisticsOrderId: id }).sort({ createdAt: -1 }).lean();
  return { order, history, audits };
}

async function cancelOrder(id, opts = {}) {
  const { order } = await getOrderById(id, opts);
  if (opts.enforcedType && order.type !== opts.enforcedType) {
    throw new LogisticsError('Order not in scope', 403, 'FORBIDDEN_SCOPE');
  }
  if (!canTransition(order.status, 'CANCELLED')) {
    throw new StateTransitionError(order.status, 'CANCELLED');
  }
  const adapter = getProviderAdapter(order.provider);
  if (order.providerOrderId) {
    await adapter.cancelOrder(order.providerOrderId);
  }
  await LogisticsOrder.updateOne({ _id: id }, { $set: { status: 'CANCELLED' } });
  await appendHistory(id, 'CANCELLED', 'Cancelled via API', 'MANUAL');
  const updated = await LogisticsOrder.findById(id).lean();
  await emitStatus(updated, 'CANCELLED', {});
  return updated;
}

async function getTracking(id, opts = {}) {
  const { order } = await getOrderById(id, opts);
  if (opts.enforcedType && order.type !== opts.enforcedType) {
    throw new LogisticsError('Order not in scope', 403, 'FORBIDDEN_SCOPE');
  }
  if (!order.providerOrderId) {
    return { order, tracking: { status: order.status, path: [], raw: {} } };
  }
  const adapter = getProviderAdapter(order.provider);
  const tracking = await adapter.trackOrder(order.providerOrderId);
  return { order, tracking };
}

async function applyWebhookStatusUpdate({
  providerOrderId,
  nextStatus,
  message,
  driver,
  location,
}) {
  const order = await LogisticsOrder.findOne({ providerOrderId }).exec();
  if (!order) {
    logger.warn('[logistics] webhook for unknown providerOrderId', { providerOrderId });
    return { ok: false, reason: 'UNKNOWN_ORDER' };
  }
  const from = order.status;
  if (from === nextStatus) {
    return { ok: true, duplicate: true };
  }
  if (!canTransition(from, nextStatus)) {
    logger.warn('[logistics] illegal webhook transition', { from, nextStatus, id: order._id });
    return { ok: false, reason: 'ILLEGAL_TRANSITION', from, nextStatus };
  }
  order.status = nextStatus;
  if (nextStatus === 'DRIVER_ASSIGNED') order.assignedAt = new Date();
  if (nextStatus === 'PICKED_UP') order.pickedUpAt = new Date();
  if (nextStatus === 'DELIVERED') order.deliveredAt = new Date();
  if (driver) {
    order.driverInfo = {
      name: driver.name,
      phone: driver.phone,
      vehicleNumber: driver.vehicleNumber || driver.vehicle_number,
      vehicleType: driver.vehicleType || driver.vehicle_type,
    };
  }
  await order.save();
  await appendHistory(order._id, nextStatus, message || 'Webhook', 'WEBHOOK', location);
  await emitStatus(order.toObject(), nextStatus, {});
  return { ok: true, order };
}

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  cancelOrder,
  getTracking,
  applyWebhookStatusUpdate,
  appendHistory,
};
