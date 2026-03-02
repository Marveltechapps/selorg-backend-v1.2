const mongoose = require('mongoose');

const maintenanceTaskSchema = new mongoose.Schema(
  {
    task_id: {
      type: String,
      required: true,
      unique: true,
    },
    equipment_id: {
      type: String,
      required: true,
    },
    equipment_name: {
      type: String,
      required: true,
    },
    task_type: {
      type: String,
      required: true,
      enum: ['preventive', 'corrective', 'breakdown'],
    },
    priority: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    status: {
      type: String,
      required: true,
      enum: ['scheduled', 'in-progress', 'completed', 'overdue'],
      default: 'scheduled',
    },
    scheduled_date: {
      type: String,
      required: true,
    },
    completed_date: { type: String },
    technician: { type: String },
    description: {
      type: String,
      required: true,
    },
    estimated_hours: { type: Number },
    store_id: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

maintenanceTaskSchema.index({ store_id: 1, status: 1 });
maintenanceTaskSchema.index({ task_id: 1 });

module.exports = mongoose.models.MaintenanceTask || mongoose.model('MaintenanceTask', maintenanceTaskSchema);
