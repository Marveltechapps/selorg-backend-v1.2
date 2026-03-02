const equipmentService = require('../services/equipmentService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Equipment & Assets Controller
 */
const equipmentController = {
  getDevices: asyncHandler(async (req, res) => {
    const devices = await equipmentService.listDevices();
    res.status(200).json({ success: true, data: devices, meta: { count: devices.length } });
  }),

  getDeviceDetails: asyncHandler(async (req, res) => {
    const device = await equipmentService.getDeviceById(req.params.id);
    res.status(200).json({ success: true, data: device });
  }),

  getMachinery: asyncHandler(async (req, res) => {
    const machinery = await equipmentService.listMachinery();
    res.status(200).json({ success: true, data: machinery, meta: { count: machinery.length } });
  }),

  addEquipment: asyncHandler(async (req, res) => {
    const equipment = await equipmentService.addEquipment(req.body);
    res.status(201).json({ success: true, data: equipment });
  }),

  getEquipmentDetails: asyncHandler(async (req, res) => {
    const equipment = await equipmentService.getEquipmentById(req.params.id);
    res.status(200).json({ success: true, data: equipment });
  }),

  reportIssue: asyncHandler(async (req, res) => {
    const ticket = await equipmentService.reportIssue(req.params.id, req.body);
    res.status(200).json({ success: true, data: ticket, meta: { message: 'Issue reported successfully' } });
  }),

  resolveIssue: asyncHandler(async (req, res) => {
    const equipment = await equipmentService.resolveIssue(req.params.id);
    res.status(200).json({ success: true, data: equipment, meta: { message: 'Issue marked as resolved' } });
  }),

  exportEquipment: asyncHandler(async (req, res) => {
    const csv = await equipmentService.exportEquipment();
    res.status(200).json({ success: true, data: { csv }, meta: { message: 'CSV export initiated' } });
  })
};

module.exports = equipmentController;

