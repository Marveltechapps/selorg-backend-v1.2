const interWarehouseService = require('../services/interWarehouseService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Inter-Warehouse Transfer Controller
 */
const interWarehouseController = {
  getTransfers: asyncHandler(async (req, res) => {
    const transfers = await interWarehouseService.listTransfers();
    res.status(200).json({ success: true, count: transfers.length, data: transfers });
  }),

  requestTransfer: asyncHandler(async (req, res) => {
    const transfer = await interWarehouseService.requestTransfer(req.body);
    res.status(201).json({ success: true, data: transfer });
  }),

  getTransferDetails: asyncHandler(async (req, res) => {
    const transfer = await interWarehouseService.getTransferById(req.params.id);
    res.status(200).json({ success: true, data: transfer });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const transfer = await interWarehouseService.updateStatus(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Status updated', data: transfer });
  }),

  getTracking: asyncHandler(async (req, res) => {
    const tracking = await interWarehouseService.getTracking(req.params.id);
    res.status(200).json({ success: true, data: tracking });
  }),

  exportTransfers: asyncHandler(async (req, res) => {
    const transfers = await interWarehouseService.listTransfers();
    res.status(200).json({
      success: true,
      message: 'CSV export initiated',
      data: `id,destination,status,items\n${transfers.map(t => `${t.id},${t.destination},${t.status},${t.items}`).join('\n')}`
    });
  })
};

module.exports = interWarehouseController;

