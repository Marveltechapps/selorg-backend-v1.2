'use strict';

const WebhookEvent = require('../../models/webhookEvent.model');
const { createPorterAdapter } = require('../../providers/porter.adapter');
const logisticsService = require('../../services/logistics.service');
const { claimEventOnce } = require('../../utils/idempotency');
const logger = require('../../utils/logger');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractPorterFields(payload) {
  // TODO(porter-contract): align with Porter webhook schema
  const orderId = payload?.order_id || payload?.orderId || payload?.data?.order_id;
  const statusRaw = payload?.status || payload?.order_status || payload?.data?.status;
  const driver = payload?.driver || payload?.driver_details || payload?.data?.driver;
  const loc = payload?.location || payload?.driver_location;
  const location =
    loc && typeof loc.lat === 'number' ? { lat: loc.lat, lng: loc.lng } : undefined;
  return { orderId, statusRaw, driver, location };
}

async function processEnvelope(envelope) {
  const { webhookEventId } = envelope.data || {};
  if (!webhookEventId) {
    logger.warn('[logistics] webhook message missing webhookEventId');
    return;
  }
  const ev = await WebhookEvent.findById(webhookEventId);
  if (!ev) {
    logger.warn('[logistics] WebhookEvent not found', { webhookEventId });
    return;
  }
  if (ev.processed) return;

  const adapter = createPorterAdapter();
  const { orderId, statusRaw, driver, location } = extractPorterFields(ev.payload);
  if (!orderId || !statusRaw) {
    ev.processingError = 'Missing order_id or status';
    ev.processed = true;
    await ev.save();
    return;
  }
  const nextStatus = adapter.mapStatus(statusRaw);
  const applied = await logisticsService.applyWebhookStatusUpdate({
    providerOrderId: String(orderId),
    nextStatus,
    message: `Porter: ${statusRaw}`,
    driver,
    location,
  });
  if (applied && applied.ok === false && applied.reason === 'ILLEGAL_TRANSITION') {
    ev.processingError = `Illegal transition ${applied.from} -> ${applied.nextStatus}`;
  }
  if (applied && applied.ok === false && applied.reason === 'UNKNOWN_ORDER') {
    ev.processingError = 'Unknown provider order id';
  }

  ev.processed = true;
  await ev.save();
}

function attachWebhookConsumer(channel) {
  const q = 'logistics.webhook.process';
  channel.prefetch(5);
  channel.consume(q, async (msg) => {
    if (!msg) return;
    let envelope;
    try {
      envelope = JSON.parse(msg.content.toString());
    } catch (e) {
      channel.ack(msg);
      return;
    }
    const first = await claimEventOnce(envelope.eventId);
    if (!first) {
      channel.ack(msg);
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await processEnvelope(envelope);
        channel.ack(msg);
        return;
      } catch (err) {
        logger.error('[logistics] webhook processor attempt failed', {
          attempt,
          error: err.message,
        });
        await sleep(500 * 2 ** attempt);
      }
    }
    try {
      const ev = await WebhookEvent.findById(envelope.data?.webhookEventId);
      if (ev) {
        ev.processingError = 'Max retries exceeded';
        ev.processed = true;
        await ev.save();
      }
    } catch (_) {
      /* ignore */
    }
    channel.nack(msg, false, false);
  });
}

module.exports = { attachWebhookConsumer };
