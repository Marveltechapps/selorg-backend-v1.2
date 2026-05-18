const logger = require('../core/utils/logger');
const { eventBus } = require('./eventBus');
const { EVENT_TYPES } = require('./eventTypes');

/**
 * Wire cross-cutting reactions to domain events.
 * Keep side effects here (logging, notifications, metrics) — not in HTTP controllers.
 */
function registerEventListeners() {
  eventBus.on(EVENT_TYPES.ORDER_CREATED, (payload) => {
    logger.info('[domain-event]', {
      event: EVENT_TYPES.ORDER_CREATED,
      orderId: payload?.orderId,
      userId: payload?.userId,
    });

    setImmediate(async () => {
      try {
        const orderId = payload?.orderId;
        if (!orderId) return;
        const { Order } = require('../customer-backend/models/Order');
        const { sendOrderStatusNotification } = require('../customer-backend/services/notificationService');
        const order = await Order.findById(orderId);
        if (!order) return;
        await sendOrderStatusNotification(order, 'pending');
      } catch (err) {
        logger.warn('[domain-event] order.created notification skipped', { error: err?.message });
      }
    });
  });

  eventBus.on(EVENT_TYPES.INVENTORY_LOW_STOCK, (payload) => {
    logger.warn('[domain-event]', {
      event: EVENT_TYPES.INVENTORY_LOW_STOCK,
      sku: payload?.sku,
      storeId: payload?.storeId,
    });
  });
}

module.exports = { registerEventListeners };
