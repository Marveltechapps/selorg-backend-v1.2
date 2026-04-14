/**
 * Every 5 minutes: pickers on active shift but stale heartbeat → admin websocket alerts.
 */
const mongoose = require('mongoose');
const PickerUser = require('../models/user.model');
const Attendance = require('../models/attendance.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');
const websocketService = require('../../utils/websocket');
const { isDbConnected } = require('../config/db');

const INTERVAL_MS = 5 * 60 * 1000;
const INACTIVE_MS = 10 * 60 * 1000;
const OFFLINE_MS = 30 * 60 * 1000;

const lastInactiveEmitted = new Map();
const lastOfflineEmitted = new Map();

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

async function findActiveShiftUserIds() {
  const start = startOfToday();
  const rows = await Attendance.find({
    punchIn: { $gte: start },
    $or: [{ punchOut: null }, { status: 'ON_DUTY' }, { status: 'ON_BREAK' }],
  })
    .select('userId')
    .lean();
  const ids = [...new Set(rows.map((r) => String(r.userId)))];
  return ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
}

async function runPresenceCheck() {
  if (!isDbConnected()) return;
  const now = Date.now();
  const activeIds = await findActiveShiftUserIds();
  if (!activeIds.length) return;

  const pickers = await PickerUser.find({
    _id: { $in: activeIds.map((id) => new mongoose.Types.ObjectId(id)) },
    status: PICKER_STATUS.ACTIVE,
  })
    .select('name phone lastSeenAt')
    .lean();

  for (const p of pickers) {
    const pid = String(p._id);
    const last = p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : 0;
    const age = last ? now - last : Number.POSITIVE_INFINITY;

    if (age > OFFLINE_MS) {
      const prev = lastOfflineEmitted.get(pid) || 0;
      if (now - prev > OFFLINE_MS) {
        lastOfflineEmitted.set(pid, now);
        try {
          websocketService.broadcastToRole?.('darkstore', 'picker_offline_critical', {
            pickerId: pid,
            pickerName: p.name,
            lastSeenAt: p.lastSeenAt,
            minutesSinceSeen: Math.round(age / 60000),
          });
          websocketService.broadcastToRole?.('warehouse', 'picker_offline_critical', {
            pickerId: pid,
            pickerName: p.name,
            lastSeenAt: p.lastSeenAt,
            minutesSinceSeen: Math.round(age / 60000),
          });
        } catch (_) {
          /* non-blocking */
        }
      }
    } else if (age > INACTIVE_MS) {
      const prev = lastInactiveEmitted.get(pid) || 0;
      if (now - prev > INACTIVE_MS) {
        lastInactiveEmitted.set(pid, now);
        try {
          websocketService.broadcastToRole?.('darkstore', 'picker_inactive', {
            pickerId: pid,
            pickerName: p.name,
            lastSeenAt: p.lastSeenAt,
            minutesSinceSeen: Math.round(age / 60000),
          });
          websocketService.broadcastToRole?.('warehouse', 'picker_inactive', {
            pickerId: pid,
            pickerName: p.name,
            lastSeenAt: p.lastSeenAt,
            minutesSinceSeen: Math.round(age / 60000),
          });
        } catch (_) {
          /* non-blocking */
        }
      }
    }
  }
}

function startPickerPresenceMonitor() {
  const run = () => {
    runPresenceCheck().catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[pickerPresenceMonitor]', err?.message || err);
      }
    });
  };
  setInterval(run, INTERVAL_MS);
  setTimeout(run, 15 * 1000);
}

module.exports = { startPickerPresenceMonitor, runPresenceCheck };
