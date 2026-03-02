/**
 * In-Memory Cache Service
 * Provides centralized caching for the admin dashboard. Uses in-memory TTL store only (no Redis).
 */

const logger = require('../utils/logger');

/** Simple in-memory TTL store: key -> { value, expiresAt } */
function createMemoryStore() {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value, ttlSeconds) {
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
      store.set(key, { value, expiresAt });
    },
    del(key) {
      store.delete(key);
    },
    keys(pattern) {
      const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      const re = new RegExp(`^${regex}$`);
      return [...store.keys()].filter(k => re.test(k));
    },
    exists(key) {
      const entry = store.get(key);
      if (!entry) return false;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return false;
      }
      return true;
    },
    ttl(key) {
      const entry = store.get(key);
      if (!entry || !entry.expiresAt) return -1;
      const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2; // -2 = expired
    },
  };
}

class CacheService {
  constructor() {
    this.memoryStore = createMemoryStore();
  }

  /**
   * Initialize cache (in-memory only; no-op for compatibility)
   */
  async connect() {
    // In-memory cache is always ready; no connection needed
    return;
  }

  /**
   * Get cached value
   */
  async get(key) {
    const raw = this.memoryStore.get(key);
    return raw != null ? raw : null;
  }

  /**
   * Set cached value with TTL
   */
  async set(key, value, ttlSeconds) {
    this.memoryStore.set(key, value, ttlSeconds);
    return true;
  }

  /**
   * Delete cached value
   */
  async del(key) {
    this.memoryStore.del(key);
    return true;
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern) {
    const keys = this.memoryStore.keys(pattern);
    keys.forEach(k => this.memoryStore.del(k));
    return keys.length;
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    return this.memoryStore.exists(key);
  }

  /**
   * Get TTL for a key (seconds remaining, or -1 if no TTL, -2 if expired)
   */
  async ttl(key) {
    return this.memoryStore.ttl(key);
  }

  /**
   * Invalidate cache by namespace
   */
  async invalidateNamespace(namespace) {
    return this.delPattern(`${namespace}:*`);
  }

  /**
   * Delete multiple keys by pattern (alias for delPattern for backward compatibility)
   */
  async delByPattern(pattern) {
    return this.delPattern(pattern);
  }

  /**
   * Check if cache is ready (always true for in-memory)
   */
  async isReady() {
    return true;
  }

  /**
   * Get cache stats for admin/monitoring (keys count).
   */
  async getStats() {
    const keys = this.memoryStore.keys('*');
    return {
      connected: false,
      keysCount: keys.length,
      memoryUsed: 'N/A (in-memory)',
    };
  }

  /**
   * Close/disconnect (no-op for in-memory)
   */
  async disconnect() {
    // No connection to close
  }
}

// Singleton instance
const cacheService = new CacheService();

// Initialize on module load (no-op; in-memory is always ready)
if (process.env.NODE_ENV !== 'test') {
  setImmediate(() => {
    cacheService.connect().catch(err => {
      logger.warn('Cache init (no-op)', { error: err.message });
    });
  });
}

module.exports = cacheService;
