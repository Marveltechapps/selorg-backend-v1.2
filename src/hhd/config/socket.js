const { Server: SocketIOServer } = require('socket.io');
const jwt = require('jsonwebtoken');
const pubsub = require('../../utils/pubsub');
const logger = require('../../core/utils/logger');

let io;
let unsubscribe = null;

function initSocketIO(httpServer) {
  // Guard against double initialization (prevents "handleUpgrade called more than once"
  // when server restarts or module is required multiple times)
  if (io) {
    logger.warn('Socket.IO already initialized, skipping');
    return io;
  }

  const JWT_SECRET = process.env.JWT_SECRET;

  io = new SocketIOServer(httpServer, {
    path: '/hhd-socket.io',
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',')) || ['http://localhost:3000']
        : true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT auth for dashboard clients (optional: HHD/Picker may connect without token for legacy flows)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next();
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id || decoded.userId;
      socket.role = decoded.role || decoded.roleId;
      socket.primaryStoreId = decoded.primaryStoreId || (decoded.assignedStores && decoded.assignedStores[0]) || '';
      next();
    } catch {
      next();
    }
  });

  io.on('connection', async (socket) => {
    logger.info(`Socket connected: ${socket.id} (user=${socket.userId}, role=${socket.role})`);
    if (socket.userId) socket.join(`user:${socket.userId}`);
    if (socket.role) socket.join(`role:${String(socket.role).toLowerCase()}`);
    socket.on('subscribe', (room) => { socket.join(room); });
    socket.on('unsubscribe', (room) => { socket.leave(room); });
    socket.on('join:user', (userId) => { socket.join(`user:${userId}`); });
    socket.on('join:order', (orderId) => { socket.join(`order:${orderId}`); });
    socket.on('order:update', (data) => {
      if (data?.orderId) io.to(`order:${data.orderId}`).emit('order:updated', data);
    });
    socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));

    // Emit live_orders:snapshot for darkstore clients — Live Order Board data comes only from WebSocket
    const storeId = socket.primaryStoreId || process.env.DEFAULT_STORE_ID || '';
    const role = String(socket.role || '').toLowerCase();
    if (role === 'darkstore' && storeId) {
      try {
        const { fetchLiveOrdersData } = require('../../darkstore/controllers/dashboardController');
        const { orders } = await fetchLiveOrdersData(storeId, 'all', 5);
        socket.emit('live_orders:snapshot', { store_id: storeId, orders });
      } catch (err) {
        logger.warn('Failed to emit live_orders:snapshot', { error: err.message });
      }
    }
  });

  // Subscribe to pubsub (in-memory or Redis) to relay real-time events
  if (JWT_SECRET) {
    unsubscribe = pubsub.subscribe((channel, message) => {
      try {
        const payload = JSON.parse(message);
        const { target, event, data } = payload;
        switch (channel) {
          case 'ws:role':
            io.to(`role:${String(target || '').toLowerCase()}`).emit(event, data);
            break;
          case 'ws:user':
            io.to(`user:${target}`).emit(event, data);
            break;
          case 'ws:room':
            io.to(target).emit(event, data);
            break;
          case 'ws:broadcast':
            io.emit(event, data);
            break;
          case 'ws:hhd':
            if (payload.roomType === 'order') io.to(`order:${target}`).emit(event, data);
            else if (payload.roomType === 'user') io.to(`user:${target}`).emit(event, data);
            else io.emit(event, data);
            break;
          default:
            break;
        }
      } catch (e) {
        logger.warn('Socket.IO message parse error', { error: e.message });
      }
    });
    logger.info('Socket.IO subscribed to pubsub for real-time relay');
  }

  logger.info('Socket.IO initialized');
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initSocketIO, getIO };
