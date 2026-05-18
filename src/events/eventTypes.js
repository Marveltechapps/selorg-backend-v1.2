/**
 * Canonical event names — do not emit ad-hoc strings from controllers.
 */
const EVENT_TYPES = Object.freeze({
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_PICKED: 'order.picked',
  ORDER_DISPATCHED: 'order.dispatched',
  ORDER_DELIVERED: 'order.delivered',

  INVENTORY_UPDATED: 'inventory.updated',
  INVENTORY_LOW_STOCK: 'inventory.low_stock',

  DELIVERY_ASSIGNED: 'delivery.assigned',
  DELIVERY_COMPLETED: 'delivery.completed',

  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
});

module.exports = { EVENT_TYPES };
