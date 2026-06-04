/** Maximum distance from assigned darkstore to start a shift (meters). */
const PICKER_SHIFT_GEOFENCE_M = 200;

/** Maximum acceptable GPS accuracy reported by the device (meters). */
const PICKER_SHIFT_MAX_GPS_ACCURACY_M = 200;

function validateReportedGpsAccuracy(accuracyMeters) {
  if (accuracyMeters == null || accuracyMeters === '') {
    return null;
  }
  const parsed = parseFloat(accuracyMeters);
  if (!Number.isFinite(parsed)) {
    return 'Invalid GPS accuracy value';
  }
  if (parsed > PICKER_SHIFT_MAX_GPS_ACCURACY_M) {
    return `GPS accuracy too low (${Math.round(parsed)}m > ${PICKER_SHIFT_MAX_GPS_ACCURACY_M}m). Move closer to your darkstore and retry.`;
  }
  return null;
}

module.exports = {
  PICKER_SHIFT_GEOFENCE_M,
  PICKER_SHIFT_MAX_GPS_ACCURACY_M,
  validateReportedGpsAccuracy,
};
