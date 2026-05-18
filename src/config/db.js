const mongoose = require('mongoose');
const logger = require('../core/utils/logger');

/**
 * Database Connection Configuration
 * CRITICAL FIX P0.4: Optimized connection pooling
 * - maxPoolSize: 50 (maximum connections)
 * - minPoolSize: 10 (minimum idle connections)
 * - Prevents connection exhaustion
 * - Monitors pool utilization every 30 seconds
 */
const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';

    // ✅ FIX P0.4: Optimized pool configuration
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // ===== CONNECTION POOLING CONFIG =====
      maxPoolSize: 50,           // Maximum connections in pool
      minPoolSize: 10,           // Minimum idle connections
      waitQueueTimeoutMS: 5000,  // Timeout waiting for connection
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,    // Socket timeout
      family: 4,                 // IPv4
      retryWrites: true,
      w: 'majority',
      authSource: 'admin',
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 30000,
    });

    logger.info('MongoDB Connected', {
      host: conn.connection.host,
      database: conn.connection.name,
      poolSize: {
        min: 10,
        max: 50,
      }
    });

    // ✅ FIX P0.4: Setup pool monitoring
    setupPoolMonitoring();

  } catch (err) {
    logger.error('Database connection error', {
      error: err.message,
      stack: err.stack,
    });
    logger.warn('Server will continue running, but DB features will be unavailable');
    // We don't exit the process here so the server stays alive for other requests
  }
};

/**
 * Monitor connection pool statistics every 30 seconds
 */
function setupPoolMonitoring() {
  const monitoringInterval = setInterval(() => {
    try {
      const stats = getPoolStatistics();
      if (stats.utilization > 80) {
        logger.warn('[DB Pool] High utilization detected', {
          utilization: stats.utilization + '%',
          active: stats.activeConnections,
          available: stats.availableConnections,
          waiting: stats.waitingRequests,
        });
      }
      if (stats.waitingRequests > 0) {
        logger.warn('[DB Pool] Requests waiting for connection', {
          count: stats.waitingRequests,
        });
      }
    } catch (error) {
      // Silently fail - monitoring is non-critical
    }
  }, 30000); // Every 30 seconds

  process.on('exit', () => clearInterval(monitoringInterval));
}

/**
 * Get current pool statistics
 */
function getPoolStatistics() {
  try {
    const client = mongoose.connection.getClient();
    let activeConnections = 0;
    let availableConnections = 0;
    let waitingRequests = 0;

    if (client && client.topology && client.topology.s && client.topology.s.pool) {
      const pool = client.topology.s.pool;
      activeConnections = pool.checkedOut || 0;
      availableConnections = pool.availableConnectionCount || 0;
      waitingRequests = pool.waitQueue?.length || 0;
    }

    const maxPoolSize = 50;
    const utilization = maxPoolSize > 0 ? Math.round((activeConnections / maxPoolSize) * 100) : 0;

    return {
      activeConnections,
      availableConnections,
      waitingRequests,
      maxPoolSize,
      utilization,
      status: utilization > 80 ? 'HIGH' : utilization > 50 ? 'MEDIUM' : 'LOW',
    };
  } catch (error) {
    return {
      activeConnections: 0,
      availableConnections: 0,
      waitingRequests: 0,
      maxPoolSize: 50,
      utilization: 0,
      status: 'UNKNOWN',
    };
  }
}

/**
 * Get connection pool health for health check endpoints
 */
function getConnectionPoolHealth() {
  const stats = getPoolStatistics();
  const isHealthy = stats.waitingRequests < 5 && stats.utilization < 90;

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    pool: stats,
    timestamp: new Date().toISOString(),
  };
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

async function waitForConnection(timeoutMs = 10000) {
  if (isConnected()) return;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (isConnected()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('MongoDB connection timeout'));
      setTimeout(check, 100);
    };
    check();
  });
}

module.exports = connectDB;
module.exports.isConnected = isConnected;
module.exports.waitForConnection = waitForConnection;
module.exports.mongoose = mongoose;
module.exports.getConnectionPoolHealth = getConnectionPoolHealth;
module.exports.getPoolStatistics = getPoolStatistics;
