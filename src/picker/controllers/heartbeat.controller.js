/**
 * Picker Heartbeat Controller
 * POST /api/v1/picker/heartbeat — body: { status?, activeOrderId?, batteryLevel?, gpsLocation?, onBreak? }
 * Requires picker JWT. Updates lastSeenAt, batteryLevel, gpsLocation, activeOrderId, onBreak.
 * Worker Status Engine: derived status (AVAILABLE/PICKING/ON_BREAK/OFFLINE) computed in getPickersLive.
 */
const PickerUser = require('../models/user.model');
const websocketService = require('../../utils/websocket');
const { WORKER_STATUS } = require('../../constants/pickerEnums');

const HEARTBEAT_OFFLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds - picker becomes OFFLINE after this

function deriveWorkerStatus(picker, now) {
  const lastSeenAt = picker.lastSeenAt ? new Date(picker.lastSeenAt).getTime() : null;
  const isOnline = lastSeenAt && (now - lastSeenAt) < HEARTBEAT_OFFLINE_THRESHOLD_MS;
  if (!isOnline) return WORKER_STATUS.OFFLINE;
  if (picker.onBreak) return WORKER_STATUS.ON_BREAK;
  if (picker.activeOrderId) return WORKER_STATUS.PICKING;
  return WORKER_STATUS.AVAILABLE;
}

async function postHeartbeat(req, res) {
  try {
    const pickerId = req.userId;
    if (!pickerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { status, activeOrderId, batteryLevel, gpsLocation, onBreak } = req.body || {};
    const now = new Date();

    const picker = await PickerUser.findById(pickerId);
    if (!picker) {
      return res.status(404).json({ success: false, error: 'Picker not found' });
    }

    const previousLastSeenAt = picker.lastSeenAt ? picker.lastSeenAt.getTime() : null;
    const wasOffline = previousLastSeenAt && (now - previousLastSeenAt) > HEARTBEAT_OFFLINE_THRESHOLD_MS;
    const previousStatus = deriveWorkerStatus(picker, now);

    picker.lastSeenAt = now;
    if (typeof batteryLevel === 'number') picker.batteryLevel = Math.min(100, Math.max(0, batteryLevel));
    if (typeof activeOrderId === 'string') picker.activeOrderId = activeOrderId;
    if (typeof onBreak === 'boolean') picker.onBreak = onBreak;
    if (gpsLocation && typeof gpsLocation.latitude === 'number' && typeof gpsLocation.longitude === 'number') {
      picker.gpsLocation = {
        latitude: gpsLocation.latitude,
        longitude: gpsLocation.longitude,
        timestamp: gpsLocation.timestamp ? new Date(gpsLocation.timestamp) : now,
      };
    }
    await picker.save();

    const newStatus = deriveWorkerStatus(picker, now);
    const statusChanged = previousStatus !== newStatus;

    // Emit PICKER_STATUS_CHANGED when status changes (including coming back online)
    if (wasOffline || statusChanged) {
      try {
        websocketService.broadcastToRole?.('darkstore', 'PICKER_STATUS_CHANGED', {
          pickerId,
          pickerName: picker.name,
          derivedStatus: newStatus,
          online: newStatus !== WORKER_STATUS.OFFLINE,
          lastSeenAt: picker.lastSeenAt,
        });
        if (wasOffline) {
          websocketService.broadcastToRole?.('darkstore', 'PICKER_ONLINE_STATUS_CHANGED', {
            pickerId,
            pickerName: picker.name,
            online: true,
            lastSeenAt: picker.lastSeenAt,
          });
        }
      } catch (e) {
        /* non-blocking */
      }
    }

    return res.status(200).json({
      success: true,
      data: { lastSeenAt: picker.lastSeenAt },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Heartbeat update failed',
    });
  }
}

module.exports = { postHeartbeat, deriveWorkerStatus, HEARTBEAT_OFFLINE_THRESHOLD_MS };
