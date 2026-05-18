'use strict';

const { claimEventOnce } = require('../../utils/idempotency');
const logger = require('../../utils/logger');

function attachNotificationConsumer(channel) {
  const q = 'logistics.notifications';
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
    const first = await claimEventOnce(`notify:${envelope.eventId}`);
    if (!first) {
      channel.ack(msg);
      return;
    }
    // Stub: ops notification channel
    logger.info('[logistics][notify]', {
      type: envelope.eventType,
      order: envelope.data?.logisticsOrderId,
      status: envelope.data?.status,
    });
    channel.ack(msg);
  });
}

module.exports = { attachNotificationConsumer };
