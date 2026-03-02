const { Server: SocketServer } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../core/utils/logger');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  initialize(httpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || process.env.ALLOWED_ORIGINS?.split(',')[0] || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          return next(new Error('JWT_SECRET not configured'));
        }

        const decoded = jwt.verify(token, jwtSecret);
        socket.userId = decoded.id || decoded.userId;
        socket.role = decoded.role || decoded.roleId;
        next();
      } catch (err) {
        logger.warn('WebSocket authentication failed', {
          error: err.message,
          socketId: socket.id,
        });
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      this.connectedClients.set(clientId, socket);

      logger.info('WebSocket client connected', {
        clientId,
        userId: socket.userId,
        role: socket.role,
      });

      // Join user-specific room
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
      }

      // Join role-specific room
      if (socket.role) {
        socket.join(`role:${socket.role}`);
      }

      // Handle room subscriptions
      socket.on('subscribe', (room) => {
        socket.join(room);
        logger.debug('Client subscribed to room', { clientId, room });
      });

      socket.on('unsubscribe', (room) => {
        socket.leave(room);
        logger.debug('Client unsubscribed from room', { clientId, room });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.connectedClients.delete(clientId);
        logger.info('WebSocket client disconnected', { clientId });
      });
    });

    logger.info('WebSocket service initialized');
    return this.io;
  }

  // Broadcast to a specific room
  broadcastToRoom(room, event, data) {
    if (this.io) {
      this.io.to(room).emit(event, data);
    }
  }

  // Broadcast to a specific user
  broadcastToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  // Broadcast to a specific role
  broadcastToRole(role, event, data) {
    if (this.io) {
      this.io.to(`role:${role}`).emit(event, data);
    }
  }

  // Broadcast to all connected clients
  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // Get connected clients count
  getConnectedCount() {
    return this.connectedClients.size;
  }

  // Get IO instance
  getIO() {
    return this.io;
  }

  // Check if initialized
  isInitialized() {
    return this.io !== null;
  }
}

const websocketService = new WebSocketService();
module.exports = websocketService;
