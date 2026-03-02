const mongoose = require('mongoose');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Health check controller
 * Provides endpoints for monitoring application health
 */

/**
 * Basic liveness probe
 * Returns 200 if the server is running
 * Used by Kubernetes/load balancers to check if the service is alive
 */
const healthCheck = (req, res) => {
  sendSuccess(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'selorg-backend',
    version: process.env.API_VERSION || '1.0.0',
  });
};

/**
 * Readiness probe
 * Checks if the service is ready to accept traffic
 * Verifies database connectivity and other critical dependencies
 */
const readinessCheck = async (req, res) => {
  const checks = {};
  let overallStatus = 'ready';

  // Check database connection
  try {
    const dbState = mongoose.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (dbState === 1) {
      checks.database = { status: 'healthy' };
      
      // Optional: Ping the database to ensure it's responsive
      await mongoose.connection.db.admin().ping();
    } else {
      checks.database = {
        status: 'unhealthy',
        message: `Database connection state: ${dbState}`,
      };
      overallStatus = 'not_ready';
    }
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    checks.database = {
      status: 'unhealthy',
      message: error.message,
    };
    overallStatus = 'not_ready';
  }

  // Cache is in-memory only (no Redis in admin dashboard)
  checks.cache = { status: 'healthy', message: 'in-memory' };

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };

  // Warn if memory usage is high (>80% of heap)
  const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  if (heapUsagePercent > 80) {
    checks.memory = {
      status: 'warning',
      message: `High memory usage: ${Math.round(heapUsagePercent)}%`,
    };
  } else {
    checks.memory = {
      status: 'healthy',
      message: `Memory usage: ${Math.round(heapUsagePercent)}%`,
    };
  }

  const statusCode = overallStatus === 'ready' ? 200 : 503;

  if (statusCode === 200) {
    sendSuccess(res, {
      status: overallStatus,
      checks,
      memory: memoryUsageMB,
      timestamp: new Date().toISOString(),
    }, statusCode);
  } else {
    sendError(
      res,
      'SERVICE_NOT_READY',
      'Service is not ready to accept traffic',
      statusCode,
      { checks }
    );
  }
};

/**
 * Database connectivity check
 * Detailed database health information
 */
const databaseHealthCheck = async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    const dbInfo = {
      state: stateMap[dbState] || 'unknown',
      readyState: dbState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };

    if (dbState === 1) {
      // Database is connected, get additional info
      try {
        const adminDb = mongoose.connection.db.admin();
        const serverStatus = await adminDb.serverStatus();
        
        dbInfo.serverStatus = {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections,
        };

        // Ping to ensure responsiveness
        await adminDb.ping();
        dbInfo.ping = 'ok';
      } catch (pingError) {
        dbInfo.ping = 'failed';
        dbInfo.pingError = pingError.message;
      }

      sendSuccess(res, {
        status: 'healthy',
        database: dbInfo,
        timestamp: new Date().toISOString(),
      });
    } else {
      sendError(
        res,
        'DATABASE_NOT_CONNECTED',
        `Database is not connected. State: ${dbInfo.state}`,
        503,
        { database: dbInfo }
      );
    }
  } catch (error) {
    logger.error('Database health check error', { error: error.message, stack: error.stack });
    sendError(
      res,
      'DATABASE_CHECK_ERROR',
      'Failed to check database health',
      500,
      { error: error.message }
    );
  }
};

// CommonJS export for backward compatibility
module.exports = {
  healthCheck,
  readinessCheck,
  databaseHealthCheck,
};