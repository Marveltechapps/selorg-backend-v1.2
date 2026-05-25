const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';

function resolveStoreId(raw) {
  const value = raw != null ? String(raw).trim() : '';
  return value || DEFAULT_STORE_ID;
}

/**
 * @param {'today'|'7d'|'30d'|string} range
 * @returns {{ start: Date, end: Date, previousStart: Date, previousEnd: Date, label: string }}
 */
function parseReportDateRange(range) {
  const end = new Date();
  const start = new Date();
  let label = 'Today';
  let days = 1;

  switch (range) {
    case '7d':
      days = 7;
      label = 'Last 7 Days';
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      days = 30;
      label = 'Last 30 Days';
      start.setDate(end.getDate() - 30);
      break;
    case 'today':
    default:
      days = 1;
      label = 'Today';
      start.setHours(0, 0, 0, 0);
      break;
  }

  const previousEnd = new Date(start);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);

  return { start, end, previousStart, previousEnd, label, days };
}

function staffPeriodFromRange(range) {
  return range === '30d' ? 'month' : 'week';
}

module.exports = {
  DEFAULT_STORE_ID,
  resolveStoreId,
  parseReportDateRange,
  staffPeriodFromRange,
};
