/**
 * HHD Socket Service — Redis Pub/Sub Publisher
 *
 * Publishes HHD-specific events to the 'ws:hhd' Redis channel.
 * The standalone ws-server subscribes and relays to the right rooms.
 */

const Redis = require('ioredis');
const { logger } = require('../utils/logger');
const {
  isRedisConfigured,
  getRedisUrl,
  getRedisHostOptions,
  createIoRedisOptions,
  attachRedisEventHandlers,
} = require('../../utils/redisConnection');

let pub = null;

function getPublisher() {
  if (!isRedisConfigured()) return null;
  if (pub) return pub;

  const url = getRedisUrl();
  const opts = createIoRedisOptions();
  pub = url
    ? new Redis(url, opts)
    : new Redis({ ...getRedisHostOptions(), ...opts });
  attachRedisEventHandlers(pub, 'hhd-socket-redis');
  return pub;
}

function publishOrSkip(roomType, target, event, data) {
  const publisher = getPublisher();
  if (!publisher) {
    logger.debug(`HHD socket publish skipped (Redis not configured): ${event}`);
    return;
  }
  publisher.publish(
    'ws:hhd',
    JSON.stringify({ roomType, target, event, data }),
  );
}

function emitOrderUpdate(orderId, data) {
  publishOrSkip('order', orderId, 'order:updated', data);
  logger.debug(`Order update published for order: ${orderId}`);
}

function emitUserNotification(userId, data) {
  publishOrSkip('user', userId, 'notification', data);
  logger.debug(`Notification published for user: ${userId}`);
}

function emitNewOrder(userId, orderData) {
  publishOrSkip('user', userId, 'order:received', orderData);
  logger.debug(`New order notification published for user: ${userId}`);
}

module.exports = {
  SocketService: { emitOrderUpdate, emitUserNotification, emitNewOrder },
  emitOrderUpdate,
  emitUserNotification,
  emitNewOrder,
};
