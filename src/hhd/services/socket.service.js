/**
 * HHD Socket Service — Redis Pub/Sub Publisher
 *
 * Publishes HHD-specific events to the 'ws:hhd' Redis channel.
 * The standalone ws-server subscribes and relays to the right rooms.
 */

const Redis = require('ioredis');
const { logger } = require('../utils/logger');

let pub;

function getPublisher() {
  if (!pub) {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    pub = new Redis(redisUrl);
    pub.on('error', (err) => {
      logger.error(`HHD socket Redis publisher error: ${err.message}`);
    });
  }
  return pub;
}

function emitOrderUpdate(orderId, data) {
  getPublisher().publish(
    'ws:hhd',
    JSON.stringify({ roomType: 'order', target: orderId, event: 'order:updated', data })
  );
  logger.debug(`Order update published for order: ${orderId}`);
}

function emitUserNotification(userId, data) {
  getPublisher().publish(
    'ws:hhd',
    JSON.stringify({ roomType: 'user', target: userId, event: 'notification', data })
  );
  logger.debug(`Notification published for user: ${userId}`);
}

function emitNewOrder(userId, orderData) {
  getPublisher().publish(
    'ws:hhd',
    JSON.stringify({ roomType: 'user', target: userId, event: 'order:received', data: orderData })
  );
  logger.debug(`New order notification published for user: ${userId}`);
}

module.exports = {
  SocketService: { emitOrderUpdate, emitUserNotification, emitNewOrder },
  emitOrderUpdate,
  emitUserNotification,
  emitNewOrder,
};
