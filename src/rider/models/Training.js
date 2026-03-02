const mongoose = require('mongoose');

const TrainingModuleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  completed: {
    type: Boolean,
    required: true,
    default: false,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, { _id: false });

const TrainingSchema = new mongoose.Schema({
  riderId: {
    type: String,
    required: true,
    unique: true,
    match: /^RIDER-\d+$/,
    index: true,
  },
  riderName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started',
    index: true,
  },
  modules: {
    type: [TrainingModuleSchema],
    required: true,
    default: [],
  },
  modulesCompleted: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  totalModules: {
    type: Number,
    required: true,
    min: 1,
    default: 5,
  },
  progressPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'trainings',
});

// Calculate progress before save
TrainingSchema.pre('save', function(next) {
  if (this.modules && this.modules.length > 0) {
    this.modulesCompleted = this.modules.filter(m => m.completed).length;
    this.totalModules = this.modules.length;
    this.progressPercentage = Math.round((this.modulesCompleted / this.totalModules) * 100);
    
    if (this.modulesCompleted === this.totalModules && this.status !== 'completed') {
      this.status = 'completed';
      this.completedAt = new Date();
    }
  }
  next();
});

// Indexes
TrainingSchema.index({ status: 1 });
TrainingSchema.index({ riderId: 1 });

// Create and export the model
const Training = mongoose.model('Training', TrainingSchema);

module.exports = Training;

