'use strict';

const mongoose = require('mongoose');
const LogisticsOrder = require('../../models/logisticsOrder.model');
const LogisticsMetric = require('../../models/logisticsMetric.model');
const { claimEventOnce } = require('../../utils/idempotency');
const logger = require('../../utils/logger');

async function recordMetric(envelope) {
  const { logisticsOrderId, status, referenceId, provider, type } = envelope.data || {};
  if (!logisticsOrderId) return;
  const oid = mongoose.Types.ObjectId.isValid(logisticsOrderId)
    ? new mongoose.Types.ObjectId(logisticsOrderId)
    : null;
  if (!oid) return;

  const order = await LogisticsOrder.findById(oid).lean();
  const fare = order?.actualFare ?? order?.estimatedFare ?? 0;
  const km = Math.max(order?.distanceKm || 0, 0.001);
  const costPerKm = status === 'DELIVERED' ? fare / km : undefined;

  let slaBreached = false;
  if (order?.createdAt && order?.deliveredAt) {
    const hours = (new Date(order.deliveredAt) - new Date(order.createdAt)) / 36e5;
    slaBreached = hours > 6;
  }

  await LogisticsMetric.create({
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    logisticsOrderId: oid,
    referenceId: referenceId || order?.referenceId,
    status: status || order?.status,
    provider: provider || order?.provider,
    orderType: type || order?.type,
    estimatedFare: order?.estimatedFare,
    actualFare: order?.actualFare,
    distanceKm: order?.distanceKm,
    costPerKm,
    slaBreached,
  });
}

function attachAnalyticsConsumer(channel) {
  const q = 'logistics.analytics';
  channel.prefetch(10);
  channel.consume(q, async (msg) => {
    if (!msg) return;
    let envelope;
    try {
      envelope = JSON.parse(msg.content.toString());
    } catch (_) {
      channel.ack(msg);
      return;
    }
    const first = await claimEventOnce(`analytics:${envelope.eventId}`);
    if (!first) {
      channel.ack(msg);
      return;
    }
    try {
      await recordMetric(envelope);
      channel.ack(msg);
    } catch (err) {
      logger.error('[logistics] analytics consumer', { error: err.message });
      channel.nack(msg, false, false);
    }
  });
}

module.exports = { attachAnalyticsConsumer };
