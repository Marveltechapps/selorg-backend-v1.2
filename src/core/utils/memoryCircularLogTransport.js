/**
 * In-memory circular buffer for Winston — backs System Tools "System Logs" with lines
 * from this Node process (ErrorLog alone was never populated by the app logger).
 */
const Transport = require('winston-transport');

const MAX_ENTRIES = Math.min(
  Math.max(parseInt(process.env.SYSTEM_LOG_BUFFER_SIZE, 10) || 2000, 100),
  10000,
);
const buffer = [];

function mapWinstonLevel(lvl) {
  if (lvl === 'error' || lvl === 'warn' || lvl === 'info' || lvl === 'debug') return lvl;
  if (lvl === 'verbose' || lvl === 'http' || lvl === 'silly') return 'debug';
  return 'info';
}

function normalizeEntry(info) {
  const level = mapWinstonLevel(info.level);

  let message = info.message;
  if (message != null && typeof message !== 'string') {
    message = JSON.stringify(message);
  }
  if (message == null) message = '';

  const tsRaw = info.timestamp;
  let timestamp;
  if (tsRaw instanceof Date) {
    timestamp = tsRaw.toISOString();
  } else if (typeof tsRaw === 'string') {
    const d = new Date(tsRaw);
    timestamp = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } else {
    timestamp = new Date().toISOString();
  }

  const service = String(info.service || 'selorg-backend');

  const meta = { ...info };
  delete meta.level;
  delete meta.message;
  delete meta.timestamp;
  delete meta.splat;

  let detailsText;
  try {
    const keys = Object.keys(meta);
    detailsText =
      keys.length > 0 ? JSON.stringify(meta, (_, v) => (typeof v === 'bigint' ? String(v) : v)) : undefined;
  } catch {
    detailsText = undefined;
  }

  return {
    id: `mem-${timestamp}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp,
    level,
    service,
    message,
    details: detailsText,
  };
}

class MemoryCircularTransport extends Transport {
  log(info, callback) {
    setImmediate(() => {
      try {
        const entry = normalizeEntry(info);
        buffer.push(entry);
        while (buffer.length > MAX_ENTRIES) buffer.shift();
      } catch {
        /* never break logging */
      }
      if (callback) callback();
    });
  }
}

function getRecentBufferedLogs({ limit = 100, level, service }) {
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 500);
  let rows = [...buffer].reverse();

  if (level && level !== 'all') {
    rows = rows.filter((r) => r.level === level);
  }
  if (service && String(service).trim()) {
    const esc = service.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'i');
    rows = rows.filter((r) => re.test(r.service || ''));
  }
  return rows.slice(0, lim);
}

module.exports = { MemoryCircularTransport, getRecentBufferedLogs, bufferMax: MAX_ENTRIES };
