const EventEmitter = require('events');

/**
 * Process-wide event bus for domain events (order.created, inventory.updated, …).
 * Use listeners for notifications, analytics hooks, and future queues — not inline in controllers.
 */
class PlatformEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

const eventBus = new PlatformEventBus();

module.exports = { eventBus, PlatformEventBus };
