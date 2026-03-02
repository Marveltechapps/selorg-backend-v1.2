const mongoose = require('mongoose');

const MaintenanceTaskSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  vehicleId: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  vehicleInternalId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['Scheduled Service', 'Breakdown', 'Inspection'],
  },
  scheduledDate: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['upcoming', 'in_progress', 'completed'],
    default: 'upcoming',
    index: true,
  },
  workshopName: {
    type: String,
    default: null,
    trim: true,
  },
  notes: {
    type: String,
    default: null,
    trim: true,
  },
  cost: {
    type: Number,
    default: null,
    min: 0,
  },
}, {
  timestamps: true,
  collection: 'maintenance_tasks',
});

// Indexes for common queries
MaintenanceTaskSchema.index({ vehicleId: 1, status: 1 });
MaintenanceTaskSchema.index({ scheduledDate: 1, status: 1 });
MaintenanceTaskSchema.index({ vehicleInternalId: 1 });

const MaintenanceTask = mongoose.models.MaintenanceTask || mongoose.model('MaintenanceTask', MaintenanceTaskSchema);

module.exports = MaintenanceTask;

