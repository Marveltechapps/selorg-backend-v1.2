const mongoose = require('mongoose');

const SystemServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    type: { 
      type: String, 
      enum: ['API', 'Database', 'Queue', 'Cache', 'Storage', 'Other'],
      default: 'API',
      index: true,
    },
    status: { 
      type: String, 
      enum: ['healthy', 'degraded', 'down'],
      default: 'healthy',
      index: true,
    },
    endpoint: String,
    responseTime: Number, // milliseconds
    lastChecked: Date,
    uptime: Number, // percentage
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

SystemServiceSchema.index({ status: 1, type: 1 });

module.exports = mongoose.models.SystemService || mongoose.model('SystemService', SystemServiceSchema);
