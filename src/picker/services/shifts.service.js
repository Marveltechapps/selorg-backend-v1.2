/**
 * Shifts service – from backend-workflow.yaml (shifts_available, shifts_select, shift_start, shift_end).
 * Extended for Live Attendance: lateByMinutes, overtimeMinutes, totalWorkedMinutes, breaks, WebSocket events.
 */
const PickerShift = require('../models/shift.model');
const Attendance = require('../models/attendance.model');
const User = require('../models/user.model');
const PickerSlaConfig = require('../models/slaConfig.model');
const ShiftAssignment = require('../models/shiftAssignment.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

let websocketService;
try {
  websocketService = require('../../utils/websocket');
} catch (_) {
  websocketService = null;
}

/** Parse "09:00" or "9:30" to { hours, minutes } */
function parseTime(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = String(str).trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return { hours: h, minutes: m };
}

/** Get shift start Date for a given date */
function getShiftStartDate(date, shift) {
  const t = parseTime(shift?.startTime || shift?.time);
  if (!t) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.hours, t.minutes, 0);
}

/** Get shift end Date for a given date */
function getShiftEndDate(date, shift) {
  const t = parseTime(shift?.endTime || shift?.time);
  if (!t) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.hours, t.minutes, 0);
}

/** Check if picker has this shift for today (ShiftAssignment or selectedShifts) */
async function hasShiftForToday(userId, shiftId, date) {
  const mongoose = require('mongoose');
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

  let shiftObjId = null;
  if (mongoose.Types.ObjectId.isValid(shiftId) && String(shiftId).length === 24) {
    shiftObjId = new mongoose.Types.ObjectId(shiftId);
  } else {
    const shiftDoc = await PickerShift.findOne({ id: shiftId }).select('_id').lean();
    if (shiftDoc) shiftObjId = shiftDoc._id;
  }

  if (shiftObjId) {
    const assignment = await ShiftAssignment.findOne({
      pickerId: userId,
      shiftId: shiftObjId,
      date: dayStart,
    }).lean();
    if (assignment) return true;
  }

  const user = await User.findById(userId).select('selectedShifts').lean();
  const selected = user?.selectedShifts || [];
  const shiftIdStr = String(shiftId);
  return selected.some((s) => s?.id === shiftIdStr || String(s?.id) === shiftIdStr);
}

const getAvailable = async (userId, geoFilter = {}) => {
  try {
    let query = {};
    const { lat, lng, radiusKm = 3 } = geoFilter;
    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      try {
        const locationService = require('./location.service');
        const nearbyLocations = await locationService.getAllLocations(lat, lng, radiusKm);
        if (nearbyLocations && nearbyLocations.length > 0) {
          const locationIds = nearbyLocations.map((l) => l.locationId || l._id?.toString()).filter(Boolean);
          query.$or = [
            { siteId: { $in: locationIds } },
            { site: { $in: locationIds } },
          ];
        }
      } catch (_) {
        /* Fallback: no geo filter on error */
      }
    }
    const list = await PickerShift.find(Object.keys(query).length ? query : {}).sort({ id: 1 }).lean();
    return list.map((s) => ({ ...s, id: s.id || s._id?.toString() }));
  } catch (_) {
    return [];
  }
};

const selectShifts = async (userId, selectedShifts) => {
  const arr = Array.isArray(selectedShifts) ? selectedShifts : [];
  try {
    await withTimeout(User.findByIdAndUpdate(userId, { $set: { selectedShifts: arr } }), DB_TIMEOUT_MS);
  } catch (err) {
    console.warn('[shifts] selectShifts fallback:', err?.message);
  }
  return { success: true };
};

const start = async (userId, body) => {
  try {
    const existing = await withTimeout(Attendance.findOne({ userId, punchOut: null }), DB_TIMEOUT_MS);
    if (existing) {
      return { success: false, error: 'Already started', shiftStartTime: existing.punchIn?.getTime?.() };
    }

    const shiftId = body?.shiftId || null;
    let lateByMinutes = 0;
    let shiftDoc = null;

    if (shiftId) {
      shiftDoc = await PickerShift.findById(shiftId).lean();
      if (!shiftDoc) {
        shiftDoc = await PickerShift.findOne({ id: shiftId }).lean();
      }
      if (shiftDoc) {
        const hasShift = await hasShiftForToday(userId, shiftId, new Date());
        if (!hasShift) {
          return { success: false, error: 'You are not assigned to this shift today' };
        }

        // Server-side geofence: require location validation when shift has a work location
        const shiftLocationId = shiftDoc.siteId || shiftDoc.site;
        if (shiftLocationId) {
          const { locationId, latitude, longitude } = body || {};
          const locId = locationId ? String(locationId) : shiftLocationId;
          if (latitude == null || longitude == null) {
            return {
              success: false,
              error: 'Location verification required. Please ensure you are at the work location and grant location access.',
            };
          }
          try {
            const locationService = require('./location.service');
            const validation = await locationService.validateLocation(
              locId,
              parseFloat(latitude),
              parseFloat(longitude)
            );
            if (!validation.valid) {
              const radiusM = validation.geofenceRadius || 500;
              return {
                success: false,
                error: `Outside work location. Please move within ${radiusM}m of the store to start your shift.`,
              };
            }
          } catch (locErr) {
            console.warn('[shifts] Location validation error:', locErr?.message);
            return {
              success: false,
              error: 'Unable to verify location. Please check your connection and try again.',
            };
          }
        }

        const config = await PickerSlaConfig.getConfig();
        const tolerance = config?.lateTolerance_minutes ?? 5;
        const now = new Date();
        const shiftStart = getShiftStartDate(now, shiftDoc);
        if (shiftStart) {
          const cutoff = new Date(shiftStart.getTime() + tolerance * 60 * 1000);
          if (now > cutoff) {
            lateByMinutes = Math.round((now - cutoff) / (60 * 1000));
          }
        }
      }
    }

    const doc = await withTimeout(
      Attendance.create({
        userId,
        punchIn: new Date(),
        locationIn: body?.location || null,
        shiftId: shiftId ? String(shiftId) : null,
        status: 'ON_DUTY',
        breaks: [],
        lateByMinutes,
        overtimeMinutes: 0,
        totalWorkedMinutes: 0,
      }),
      DB_TIMEOUT_MS
    );

    try {
      if (websocketService?.broadcast) {
        websocketService.broadcast('attendance:SHIFT_STARTED', {
          attendanceId: doc._id,
          userId: String(userId),
          shiftId: shiftId ? String(shiftId) : null,
          punchIn: doc.punchIn,
          lateByMinutes,
        });
      }
    } catch (_) {}
    try {
      const cache = require('../../utils/cache');
      await cache.delByPattern('dashboard:staff-load:*');
    } catch (_) {}
    try {
      const { logPickerAction } = require('./pickerActionLog.service');
      await logPickerAction({ actionType: 'punch_in', pickerId: String(userId), metadata: { shiftId, lateByMinutes } });
    } catch (_) {}

    return { success: true, shiftStartTime: doc.punchIn?.getTime?.() ?? Date.now() };
  } catch (err) {
    console.warn('[shifts] start error:', err?.message);
    throw err;
  }
};

const end = async (userId) => {
  try {
    const doc = await withTimeout(
      Attendance.findOne({ userId, punchOut: null }).sort({ punchIn: -1 }),
      DB_TIMEOUT_MS
    );
    if (!doc) return { success: false, error: 'No active shift' };

    const punchOut = new Date();
    doc.punchOut = punchOut;

    let totalWorkedMs = punchOut - doc.punchIn;
    const breaks = doc.breaks || [];
    for (const b of breaks) {
      if (b.startTime && b.endTime) {
        totalWorkedMs -= b.endTime - b.startTime;
      }
    }
    const totalWorkedMinutes = Math.max(0, Math.round(totalWorkedMs / (60 * 1000)));
    doc.totalWorkedMinutes = totalWorkedMinutes;

    let overtimeMinutes = 0;
    if (doc.shiftId) {
      const shiftDoc = await PickerShift.findById(doc.shiftId).lean();
      if (!shiftDoc) {
        const byId = await PickerShift.findOne({ id: doc.shiftId }).lean();
        if (byId) Object.assign(shiftDoc || {}, byId);
      }
      if (shiftDoc) {
        const config = await PickerSlaConfig.getConfig();
        const grace = config?.overtimeGrace_minutes ?? 15;
        const shiftEnd = getShiftEndDate(punchOut, shiftDoc);
        if (shiftEnd) {
          const overtimeStart = new Date(shiftEnd.getTime() + grace * 60 * 1000);
          if (punchOut > overtimeStart) {
            overtimeMinutes = Math.round((punchOut - overtimeStart) / (60 * 1000));
          }
        }
      }
    }
    doc.overtimeMinutes = overtimeMinutes;
    doc.status = 'COMPLETED';

    const hrs = totalWorkedMs / (1000 * 60 * 60);
    doc.regularHours = Math.min(8, Math.round(hrs * 100) / 100);
    doc.overtimeHours = hrs > 8 ? Math.round((hrs - 8) * 100) / 100 : overtimeMinutes > 0 ? Math.round((overtimeMinutes / 60) * 100) / 100 : null;

    await withTimeout(doc.save(), DB_TIMEOUT_MS);

    try {
      if (websocketService?.broadcast) {
        websocketService.broadcast('attendance:SHIFT_ENDED', {
          attendanceId: doc._id,
          userId: String(userId),
          punchOut,
          totalWorkedMinutes,
          overtimeMinutes,
        });
      }
    } catch (_) {}
    try {
      const cache = require('../../utils/cache');
      await cache.delByPattern('dashboard:staff-load:*');
    } catch (_) {}
    try {
      const { logPickerAction } = require('./pickerActionLog.service');
      await logPickerAction({ actionType: 'punch_out', pickerId: String(userId), metadata: { totalWorkedMinutes, overtimeMinutes } });
    } catch (_) {}

    return { success: true };
  } catch (err) {
    console.warn('[shifts] end error:', err?.message);
    throw err;
  }
};

const startBreak = async (userId) => {
  try {
    const doc = await withTimeout(
      Attendance.findOne({ userId, punchOut: null }).sort({ punchIn: -1 }),
      DB_TIMEOUT_MS
    );
    if (!doc) return { success: false, error: 'No active shift' };
    const breaks = doc.breaks || [];
    const openBreak = breaks.find((b) => !b.endTime);
    if (openBreak) return { success: false, error: 'Break already in progress' };

    breaks.push({ startTime: new Date(), endTime: null });
    doc.breaks = breaks;
    doc.status = 'ON_BREAK';
    await withTimeout(doc.save(), DB_TIMEOUT_MS);

    try {
      await User.findByIdAndUpdate(userId, { $set: { onBreak: true } });
    } catch (_) {}

    try {
      if (websocketService?.broadcast) {
        websocketService.broadcast('attendance:BREAK_STARTED', {
          attendanceId: doc._id,
          userId: String(userId),
          breakIndex: breaks.length - 1,
        });
      }
    } catch (_) {}
    try {
      const { logPickerAction } = require('./pickerActionLog.service');
      await logPickerAction({ actionType: 'break_start', pickerId: String(userId) });
    } catch (_) {}

    return { success: true };
  } catch (err) {
    console.warn('[shifts] startBreak error:', err?.message);
    throw err;
  }
};

const endBreak = async (userId) => {
  try {
    const doc = await withTimeout(
      Attendance.findOne({ userId, punchOut: null }).sort({ punchIn: -1 }),
      DB_TIMEOUT_MS
    );
    if (!doc) return { success: false, error: 'No active shift' };
    const breaks = doc.breaks || [];
    const openBreakIdx = breaks.findIndex((b) => !b.endTime);
    if (openBreakIdx === -1) return { success: false, error: 'No break in progress' };

    breaks[openBreakIdx].endTime = new Date();
    doc.breaks = breaks;
    doc.status = 'ON_DUTY';
    await withTimeout(doc.save(), DB_TIMEOUT_MS);

    try {
      await User.findByIdAndUpdate(userId, { $set: { onBreak: false } });
    } catch (_) {}

    try {
      if (websocketService?.broadcast) {
        websocketService.broadcast('attendance:BREAK_ENDED', {
          attendanceId: doc._id,
          userId: String(userId),
          breakIndex: openBreakIdx,
        });
      }
    } catch (_) {}
    try {
      const { logPickerAction } = require('./pickerActionLog.service');
      await logPickerAction({ actionType: 'break_end', pickerId: String(userId) });
    } catch (_) {}

    return { success: true };
  } catch (err) {
    console.warn('[shifts] endBreak error:', err?.message);
    throw err;
  }
};

module.exports = { getAvailable, selectShifts, start, end, startBreak, endBreak };
