const mongoose = require('mongoose');

const recentSearchSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    dashboard: {
      type: String,
      enum: ['admin', 'warehouse', ''],
      default: '',
    },
    query: { type: String, required: true, trim: true },
    resultCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

recentSearchSchema.index({ userId: 1, dashboard: 1, updatedAt: -1 });

module.exports =
  mongoose.models.RecentSearch || mongoose.model('RecentSearch', recentSearchSchema);
