const logger = require('../../core/utils/logger');
const analyticsService = require('../services/analyticsService');
const AnalyticsReportSchedule = require('../models/AnalyticsReportSchedule');
const { sendEmail } = require('../../admin/services/userOnboardingEmailService');

const INTERVAL_MS = 60 * 1000;

async function processDueSchedules() {
  const now = new Date();
  const due = await AnalyticsReportSchedule.find({
    active: { $ne: false },
    nextRunAt: { $lte: now },
  })
    .limit(20)
    .lean();

  for (const schedule of due) {
    try {
      const to = new Date();
      const from = new Date(to);
      const range = schedule.dateRange || '7d';
      if (range === '30d') from.setDate(from.getDate() - 30);
      else if (range === '90d') from.setDate(from.getDate() - 90);
      else from.setDate(from.getDate() - 7);

      const exportResult = await analyticsService.exportReport({
        metric: schedule.metric || 'rider',
        format: schedule.format === 'excel' ? 'excel' : schedule.format || 'pdf',
        from: from.toISOString(),
        to: to.toISOString(),
      });

      const subject = `Rider Fleet Analytics — ${schedule.metric} (${schedule.frequency})`;
      const html = `
        <p>Your scheduled rider fleet analytics report is ready.</p>
        <p><strong>Metric:</strong> ${schedule.metric}<br/>
        <strong>Period:</strong> ${from.toLocaleDateString()} – ${to.toLocaleDateString()}</p>
        ${exportResult.reportUrl ? `<p><a href="${exportResult.reportUrl}">Download report</a></p>` : '<p>Report generated successfully.</p>'}
      `;

      await sendEmail({
        to: schedule.email,
        subject,
        html,
        text: `Scheduled ${schedule.metric} report. Download: ${exportResult.reportUrl || 'see dashboard'}`,
      }).catch((err) => {
        logger.warn('[AnalyticsReportJob] Email send failed, logged only', { email: schedule.email, err: err.message });
      });

      const nextRunAt = analyticsService.computeNextRun
        ? analyticsService.computeNextRun(schedule.frequency)
        : new Date(now.getTime() + 7 * 86400000);

      await AnalyticsReportSchedule.updateOne(
        { _id: schedule._id },
        { $set: { lastRunAt: now, nextRunAt } }
      );

      logger.info('[AnalyticsReportJob] Sent scheduled report', { email: schedule.email, metric: schedule.metric });
    } catch (err) {
      logger.error('[AnalyticsReportJob] Failed schedule run', { id: schedule._id, err: err.message });
    }
  }
}

function startAnalyticsReportJob() {
  setInterval(() => {
    processDueSchedules().catch((err) => logger.error('[AnalyticsReportJob] tick error', err));
  }, INTERVAL_MS);
  logger.info('[AnalyticsReportJob] Started (checks every 60s)');
}

module.exports = { startAnalyticsReportJob, processDueSchedules };
