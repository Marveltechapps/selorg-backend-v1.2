/**
 * Watch History Model
 * Tracks user's progress watching training videos
 */
const mongoose = require('mongoose');

const watchHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true },
  videoId: { type: String, required: true },
  watchedSeconds: { type: Number, default: 0 },
  lastWatchedPosition: { type: Number, default: 0 },
  completedAt: { type: Date },
  attempts: [{
    startedAt: { type: Date },
    watchedSeconds: { type: Number },
    completedAt: { type: Date }
  }]
}, { timestamps: true, collection: 'training_watch_history' });

// Indexes for efficient querying
watchHistorySchema.index({ userId: 1, videoId: 1 }, { unique: true });
watchHistorySchema.index({ userId: 1, completedAt: 1 });

module.exports = mongoose.model('WatchHistory', watchHistorySchema);
