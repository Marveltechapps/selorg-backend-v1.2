const { getIO } = require('../config/socket');
const { logger } = require('../utils/logger');

function emitOrderUpdate(orderId, data) {
  const io = getIO();
  io.to(`order:${orderId}`).emit('order:updated', data);
  logger.debug(`Order update emitted for order: ${orderId}`);
}

function emitUserNotification(userId, data) {
  const io = getIO();
  io.to(`user:${userId}`).emit('notification', data);
  logger.debug(`Notification sent to user: ${userId}`);
}

function emitNewOrder(userId, orderData) {
  const io = getIO();
  io.to(`user:${userId}`).emit('order:received', orderData);
  logger.debug(`New order notification sent to user: ${userId}`);
}

module.exports = {
  SocketService: { emitOrderUpdate, emitUserNotification, emitNewOrder },
  emitOrderUpdate,
  emitUserNotification,
  emitNewOrder,
};
