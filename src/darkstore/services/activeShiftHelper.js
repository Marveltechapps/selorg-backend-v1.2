/**
 * Active Shift Helper
 * Returns picker IDs (PickerUser._id) who are currently in an active shift (punched in, not punched out).
 * Used to filter HHD availability in dashboard - only show pickers who have punched in.
 */
const PickerAttendance = require('../../picker/models/attendance.model');

/**
 * Get Set of picker user IDs who have an active attendance record (punchOut is null).
 * @returns {Promise<Set<string>>} Set of picker _id strings
 */
async function getPickerIdsInActiveShift() {
  try {
    const records = await PickerAttendance.find({ punchOut: null })
      .select('userId')
      .lean();
    const ids = new Set(records.map((r) => String(r.userId)).filter(Boolean));
    return ids;
  } catch (err) {
    console.warn('[activeShiftHelper] getPickerIdsInActiveShift error:', err?.message);
    return new Set();
  }
}

module.exports = { getPickerIdsInActiveShift };
