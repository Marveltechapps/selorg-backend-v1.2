/**
 * Application - Internal selorg applications (rider_app, customer_app, etc.)
 * Used by Applications Management screen for status, health, enable/disable
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const APPLICATION_TYPES = ['rider_app', 'customer_app', 'dashboard', 'picker_app', 'hhd_app', 'darkstore'];

const ApplicationSchema = new Schema(
  {
    type: { type: String, required: true, enum: APPLICATION_TYPES, unique: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: '' },
    baseUrl: { type: String, required: true }, // Health check URL (e.g. http://localhost:5001)
    healthPath: { type: String, default: '/health' }, // /health or /healthz
    enabled: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: {} },
    lastHealthCheck: { type: Date },
    lastHealthStatus: { type: String, enum: ['healthy', 'degraded', 'down', null], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Application || mongoose.model('Application', ApplicationSchema);
