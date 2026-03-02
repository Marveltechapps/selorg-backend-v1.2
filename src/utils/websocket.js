/**
 * WebSocket Service — Redis Pub/Sub Publisher
 *
 * Instead of managing Socket.IO connections directly, this service
 * publishes events to Redis channels. A standalone ws-server process
 * subscribes and relays them to connected dashboard/app clients.
 *
 * The public API (broadcastToRole, broadcastToUser, broadcastToRoom,
 * broadcast) is unchanged so callers require zero modifications.
 */

const Redis = require('ioredis');
const logger = require('../core/utils/logger');

class WebSocketService {
  constructor() {
    this.pub = null;
    this._ready = false;
  }

  /**
   * Initialise the Redis publisher. Called once from server.js on startup.
   * The `httpServer` param is accepted for backward-compat but ignored —
   * Socket.IO now lives in the separate ws-server process.
   */
  initialize(_httpServer) {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    this.pub = new Redis(redisUrl);

    this.pub.on('connect', () => {
      this._ready = true;
      logger.info('WebSocket service: Redis publisher connected', { redisUrl });
    });

    this.pub.on('error', (err) => {
      logger.error('WebSocket service: Redis publisher error', { error: err.message });
    });

    this.pub.on('close', () => {
      this._ready = false;
      logger.warn('WebSocket service: Redis publisher disconnected');
    });

    logger.info('WebSocket service initialized (Redis Pub/Sub mode)');
  }

  _publish(channel, payload) {
    if (!this.pub) {
      logger.warn('WebSocket service: publish called before initialize');
      return;
    }
    try {
      this.pub.publish(channel, JSON.stringify(payload));
    } catch (err) {
      logger.error('WebSocket service: publish failed', {
        channel,
        error: err.message,
      });
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
