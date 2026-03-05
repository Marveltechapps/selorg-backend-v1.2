/**
 * Picker Workforce Device controller – warehouse dashboard device inventory.
 */
const devicesService = require('../services/devicesService');
const cacheInvalidation = require('../cacheInvalidation');
const { asyncHandler } = require('../../core/middleware');

const devicesController = {
  list: asyncHandler(async (req, res) => {
    const { status, search } = req.query;
    const devices = await devicesService.listDevices({ status, search });
    res.status(200).json({ success: true, data: devices, meta: { count: devices.length } });
  }),

  create: asyncHandler(async (req, res) => {
    const { deviceId, serial } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }
    const device = await devicesService.createDevice({ deviceId, serial });
    await cacheInvalidation.invalidateWarehouse().catch(() => {});
    res.status(201).json({ success: true, data: device });
  }),

  patch: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { action, pickerId, condition, photoUrl } = req.body;
    if (!action) {
      return res.status(400).json({ success: false, message: 'action is required (assign, return, mark_damaged)' });
    }
    const device = await devicesService.patchDevice(id, action, { pickerId, condition, photoUrl });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    if (action === 'assign' || action === 'return') {
      try {
        const { logAdminAction } = require('../../admin/services/adminAudit.service');
        await logAdminAction({
          module: 'admin',
          action: action === 'assign' ? 'device_assigned' : 'device_returned',
          entityType: 'device',
          entityId: id,
          userId: req.user?.userId || req.user?.id,
          details: { deviceId: device.deviceId, pickerId: action === 'assign' ? pickerId : null },
          req,
        });
      } catch (auditErr) { /* non-blocking */ }
    }
    await cacheInvalidation.invalidateWarehouse().catch(() => {});
    res.status(200).json({ success: true, data: device });
  }),
};

module.exports = devicesController;
