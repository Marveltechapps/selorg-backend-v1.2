const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemService', index: true },
    serviceName: { type: String, index: true },
    level: { 
      type: String, 
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
      index: true,
    },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

SystemLogSchema.index({ serviceName: 1, timestamp: -1 });
SystemLogSchema.index({ level: 1, timestamp: -1 });

module.exports = mongoose.models.SystemLog || mongoose.model('SystemLog', SystemLogSchema);
