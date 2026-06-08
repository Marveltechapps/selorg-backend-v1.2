const mongoose = require('mongoose');

const AnalyticsReportScheduleSchema = new mongoose.Schema(
  {
    createdBy: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    metric: { type: String, enum: ['rider', 'sla', 'fleet', 'exceptions'], required: true },
    format: { type: String, enum: ['pdf', 'excel', 'csv'], default: 'pdf' },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    dateRange: { type: String, default: '7d' },
    includeCharts: { type: Boolean, default: true },
    includeSummary: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    lastSentAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'analytics_report_schedules' }
);

module.exports =
  mongoose.models.AnalyticsReportSchedule ||
  mongoose.model('AnalyticsReportSchedule', AnalyticsReportScheduleSchema);
