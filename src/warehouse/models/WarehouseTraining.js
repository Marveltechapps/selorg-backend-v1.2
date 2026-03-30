const mongoose = require('mongoose');

const WarehouseTrainingSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  trainingId: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['Safety', 'Equipment', 'Process', 'Compliance', 'Mandatory', 'Quality', 'Technical', 'Operational', 'Leadership'], default: 'Process' },
  date: { type: Date, required: true },
  duration: { type: String },
  instructor: { type: String },
  enrolled: { type: Number, default: 0 },
  capacity: { type: Number, default: 20 },
  status: { type: String, enum: ['upcoming', 'ongoing', 'completed'], default: 'upcoming' },
  description: { type: String },
  enrolledStaff: [{ type: String }] // Staff IDs
}, { timestamps: true, collection: 'warehouse_trainings' });

WarehouseTrainingSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.WarehouseTraining || mongoose.model('WarehouseTraining', WarehouseTrainingSchema);

