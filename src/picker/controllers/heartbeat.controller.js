/**
 * Picker Heartbeat Controller
 * POST /api/v1/picker/heartbeat — body: { status?, activeOrderId?, batteryLevel?, gpsLocation? }
 * Requires picker JWT. Updates lastSeenAt, batteryLevel, gpsLocation, activeOrderId.
 */
const PickerUser = require('../models/user.model');
const websocketService = require('../../utils/websocket');

const HEARTBEAT_OFFLINE_THRESHOLD_MS = 90 * 1000; // 90 seconds

async function postHeartbeat(req, res) {
  try {
    const pickerId = req.userId;
    if (!pickerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { status, activeOrderId, batteryLevel, gpsLocation } = req.body || {};
    const now = new Date();

    const picker = await PickerUser.findById(pickerId);
    if (!picker) {
      return res.status(404).json({ success: false, error: 'Picker not found' });
    }

    const previousLastSeenAt = picker.lastSeenAt ? picker.lastSeenAt.getTime() : null;
    const wasOffline = previousLastSeenAt && (now - previousLastSeenAt) > HEARTBEAT_OFFLINE_THRESHOLD_MS;

    picker.lastSeenAt = now;
    if (typeof batteryLevel === 'number') picker.batteryLevel = Math.min(100, Math.max(0, batteryLevel));
    if (typeof activeOrderId === 'string') picker.activeOrderId = activeOrderId;
    if (gpsLocation && typeof gpsLocation.latitude === 'number' && typeof gpsLocation.longitude === 'number') {
      picker.gpsLocation = {
        latitude: gpsLocation.latitude,
        longitude: gpsLocation.longitude,
        timestamp: gpsLocation.timestamp ? new Date(gpsLocation.timestamp) : now,
      };
    }
    await picker.save();

    // Optional: emit PICKER_ONLINE_STATUS_CHANGED when picker comes back online
    if (wasOffline) {
      try {
        websocketService.broadcastToRole('darkstore', 'PICKER_ONLINE_STATUS_CHANGED', {
          pickerId,
          pickerName: picker.name,
          online: true,
          lastSeenAt: picker.lastSeenAt,
        });
      } catch (e) {
        // non-blocking
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

module.exports = { postHeartbeat };
