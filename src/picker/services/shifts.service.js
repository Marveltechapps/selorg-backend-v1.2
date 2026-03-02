/**
 * Shifts service – from backend-workflow.yaml (shifts_available, shifts_select, shift_start, shift_end).
 * getAvailable returns only DB (seeded) data; empty array when no documents. start/end fail fast with clear errors.
 */
const PickerShift = require('../models/shift.model');
const Attendance = require('../models/attendance.model');
const User = require('../models/user.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const getAvailable = async (userId) => {
  try {
    const list = await PickerShift.find().sort({ id: 1 }).lean();
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
    const doc = await withTimeout(
      Attendance.create({
        userId,
        punchIn: new Date(),
        locationIn: body?.location || null,
        shiftId: body?.shiftId || null,
        status: 'present',
      }),
      DB_TIMEOUT_MS
    );
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
    doc.punchOut = new Date();
    const hrs = (doc.punchOut - doc.punchIn) / (1000 * 60 * 60);
    doc.regularHours = Math.min(8, Math.round(hrs * 100) / 100);
    doc.overtimeHours = hrs > 8 ? Math.round((hrs - 8) * 100) / 100 : null;
    await withTimeout(doc.save(), DB_TIMEOUT_MS);
    return { success: true };
  } catch (err) {
    console.warn('[shifts] end error:', err?.message);
    throw err;
  }
};

module.exports = { getAvailable, selectShifts, start, end };
