/**
 * Training Video Model
 * Stores training video metadata and configuration
 */
const mongoose = require('mongoose');

const trainingVideoSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  duration: { type: Number, required: true }, // in seconds
  durationDisplay: { type: String, required: true }, // e.g., "5 min"
  videoUrl: { type: String, required: true },
  thumbnailUrl: { type: String },
  order: { type: Number, required: true },
  minimumWatchPercentage: { type: Number, default: 80 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, collection: 'training_videos' });

// Indexes for efficient querying
trainingVideoSchema.index({ videoId: 1 }, { unique: true });
trainingVideoSchema.index({ order: 1, isActive: 1 });

module.exports = mongoose.model('TrainingVideo', trainingVideoSchema);
