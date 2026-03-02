/**
 * Prometheus metrics collection
 * Provides metrics for monitoring application performance
 */

let promClient = null;

// Initialize Prometheus client (lazy loading)
const getPrometheusClient = () => {
  if (!promClient && process.env.ENABLE_METRICS === 'true') {
    try {
      const prom = require('prom-client');
      promClient = prom;
      
      // Create a Registry to register the metrics
      const register = new prom.Registry();
      
      // Add default metrics (CPU, memory, etc.)
      prom.collectDefaultMetrics({ register });
      
      // Custom metrics
      const httpRequestDuration = new prom.Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.1, 0.5, 1, 2, 5],
      });
      
      const httpRequestTotal = new prom.Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code'],
      });
      
      const activeConnections = new prom.Gauge({
        name: 'active_connections',
        help: 'Number of active connections',
      });
      
      register.registerMetric(httpRequestDuration);
      register.registerMetric(httpRequestTotal);
      register.registerMetric(activeConnections);
      
      promClient.register = register;
      promClient.httpRequestDuration = httpRequestDuration;
      promClient.httpRequestTotal = httpRequestTotal;
      promClient.activeConnections = activeConnections;
    } catch (err) {
      const logger = require('../core/utils/logger');
      logger.warn('Prometheus not available, metrics disabled', { error: err.message });
    }
  }
  return promClient;
};

/**
 * Record HTTP request metrics
 */
const recordHttpRequest = (method, route, statusCode, duration) => {
  const client = getPrometheusClient();
  if (!client) return;
  
  try {
    const durationSeconds = duration / 1000;
    client.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      durationSeconds
    );
    client.httpRequestTotal.inc({ method, route, status_code: statusCode });
  } catch (err) {
    // Ignore metrics errors
  }
};

/**
 * Get metrics in Prometheus format
 */
const getMetrics = async () => {
  const client = getPrometheusClient();
  if (!client || !client.register) {
    return '# Metrics not enabled';
  }
  
  return await client.register.metrics();
};

module.exports = {
  getPrometheusClient,
  recordHttpRequest,
  getMetrics,
};
