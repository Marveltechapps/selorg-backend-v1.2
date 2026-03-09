/**
 * WebSocket Service — Pub/Sub Publisher
 *
 * Uses shared pubsub (in-memory by default, Redis when available).
 * Real-time events work as soon as the backend runs — no separate Redis required.
 */

const pubsub = require('./pubsub');
const logger = require('../core/utils/logger');

class WebSocketService {
  constructor() {
    this._ready = true;
  }

  initialize(_httpServer) {
    pubsub.tryUseRedis();
    logger.info('WebSocket service initialized (in-memory or Redis)');
  }

  _publish(channel, payload) {
    try {
      pubsub.publish(channel, payload);
    } catch (err) {
      logger.warn('WebSocket service: publish failed', { channel, error: err.message });
    }
  }

  broadcastToRole(role, event, data) {
    this._publish('ws:role', { target: role, event, data });
  }

  broadcastToUser(userId, event, data) {
    this._publish('ws:user', { target: userId, event, data });
  }

  broadcastToRoom(room, event, data) {
    this._publish('ws:room', { target: room, event, data });
  }

  broadcast(event, data) {
    this._publish('ws:broadcast', { event, data });
  }

  /**
   * @deprecated — client count is tracked by the standalone ws-server.
   */
  getConnectedCount() {
    return 0;
  }

  /**
   * @deprecated — Socket.IO instance lives in ws-server, not here.
   * Returns null; callers should migrate away from direct io access.
   */
  getIO() {
    return null;
  }

  isInitialized() {
    return this._ready;
  }
}

const websocketService = new WebSocketService();
module.exports = websocketService;
