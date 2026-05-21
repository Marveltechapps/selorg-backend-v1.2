/**
 * Reads the tail of logs/combined.log (JSON lines) as a fallback when the in-memory buffer is empty.
 */
const fs = require('fs');
const path = require('path');

const READ_BYTES = 512 * 1024;

function mapWinstonLevel(lvl) {
  if (lvl === 'error' || lvl === 'warn' || lvl === 'info' || lvl === 'debug') return lvl;
  if (lvl === 'verbose' || lvl === 'http' || lvl === 'silly') return 'debug';
  return 'info';
}

/**
 * @param {{ limit?: number; level?: string; service?: string }} opts
 */
function tailCombinedLog(opts = {}) {
  const lim = Math.min(Math.max(parseInt(String(opts.limit), 10) || 100, 1), 500);
  const level = opts.level && opts.level !== 'all' ? opts.level : null;
  let serviceRe;
  if (opts.service && String(opts.service).trim()) {
    const esc = opts.service.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    serviceRe = new RegExp(esc, 'i');
  }

  const filePath = path.join(process.cwd(), 'logs', 'combined.log');
  if (!fs.existsSync(filePath)) {
    return [];
  }

  let raw;
  try {
    const stat = fs.statSync(filePath);
    const start = stat.size > READ_BYTES ? stat.size - READ_BYTES : 0;
    const fh = fs.openSync(filePath, 'r');
    const chunk = Buffer.alloc(stat.size - start);
    fs.readSync(fh, chunk, 0, chunk.length, start);
    fs.closeSync(fh);
    raw = chunk.toString('utf8');
  } catch {
    return [];
  }

  const lines = raw.split(/\n/).filter((l) => l.trim());
  const rows = [];

  for (let i = lines.length - 1; i >= 0 && rows.length < lim * 2; i--) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const lvl = mapWinstonLevel(parsed.level);
    if (level && lvl !== level) continue;

    let message = parsed.message;
    if (message != null && typeof message !== 'string') message = JSON.stringify(message);
    if (message == null) message = '';

    const tsRaw = parsed.timestamp;
    let timestamp;
    if (typeof tsRaw === 'string') {
      const d = new Date(tsRaw);
      timestamp = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } else {
      timestamp = new Date().toISOString();
    }

    const srv = String(parsed.service || 'selorg-backend');
    if (serviceRe && !serviceRe.test(srv)) continue;

    const meta = { ...parsed };
    delete meta.level;
    delete meta.message;
    delete meta.timestamp;
    delete meta.splat;
    let details;
    try {
      const keys = Object.keys(meta);
      details =
        keys.length > 0 ? JSON.stringify(meta, (_, v) => (typeof v === 'bigint' ? String(v) : v)) : undefined;
    } catch {
      details = undefined;
    }

    rows.push({
      id: `file-${timestamp}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp,
      level: lvl,
      service: srv,
      message,
      details,
    });
  }

  return rows.slice(0, lim);
}

module.exports = { tailCombinedLog };
