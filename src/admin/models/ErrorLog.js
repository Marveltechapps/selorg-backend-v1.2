/**
 * ErrorLog - Application error logs for System Tools viewer
 * Fields: timestamp, service, level, message, stack, correlation_id
 */
const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    service: { type: String, required: true, index: true },
    level: { type: String, required: true, enum: ['error', 'warn', 'info', 'debug'], index: true },
    message: { type: String, required: true },
    stack: { type: String },
    correlation_id: { type: String, index: true },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

errorLogSchema.index({ timestamp: -1 });
errorLogSchema.index({ service: 1, level: 1 });

module.exports = mongoose.model('ErrorLog', errorLogSchema);
