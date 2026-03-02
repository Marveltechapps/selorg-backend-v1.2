const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true },
    type: String,
    status: { type: String, enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'], default: 'pending' },
    progress: { type: Number, default: 0 },
    result: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Job || mongoose.model('Job', JobSchema);

