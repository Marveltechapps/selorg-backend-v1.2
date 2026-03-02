const { Server: SocketIOServer } = require('socket.io');
const logger = require('../../core/utils/logger');

let io;

function initSocketIO(httpServer) {
  io = new SocketIOServer(httpServer, {
    path: '/hhd-socket.io',
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',')) || ['http://localhost:3000']
        : true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('join:user', (userId) => {
      socket.join(`user:${userId}`);
    });
    socket.on('join:order', (orderId) => {
      socket.join(`order:${orderId}`);
    });
    socket.on('order:update', (data) => {
      io.to(`order:${data.orderId}`).emit('order:updated', data);
    });
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initSocketIO, getIO };
