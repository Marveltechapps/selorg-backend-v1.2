/**
 * SystemPerformanceMetric - Performance metrics for System Tools
 * Stores: latency, p95, p99, throughput, dbConnections
 */
const mongoose = require('mongoose');

const systemPerformanceMetricSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    service: { type: String, index: true },
    cpu: { type: Number },
    memory: { type: Number },
    requests: { type: Number },
    responseTime: { type: Number },
    latencyP95: { type: Number },
    latencyP99: { type: Number },
    throughput: { type: Number },
    dbConnections: { type: Number },
  },
  { timestamps: true }
);

systemPerformanceMetricSchema.index({ timestamp: -1 });
systemPerformanceMetricSchema.index({ service: 1, timestamp: -1 });

module.exports = mongoose.model('SystemPerformanceMetric', systemPerformanceMetricSchema);
