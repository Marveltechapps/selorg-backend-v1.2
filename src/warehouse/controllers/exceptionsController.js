const exceptionsService = require('../services/exceptionsService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Exception Management Controller
 */
const exceptionsController = {
  getExceptions: asyncHandler(async (req, res) => {
    const exceptions = await exceptionsService.listExceptions(req.query);
    res.status(200).json({ success: true, count: exceptions.length, data: exceptions });
  }),

  reportException: asyncHandler(async (req, res) => {
    const exception = await exceptionsService.reportException(req.body);
    res.status(201).json({ success: true, data: exception });
  }),

  getExceptionDetails: asyncHandler(async (req, res) => {
    const exception = await exceptionsService.getExceptionById(req.params.id);
    res.status(200).json({ success: true, data: exception });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const exception = await exceptionsService.updateStatus(req.params.id, req.body.status);
    res.status(200).json({ success: true, data: exception });
  }),

  rejectShipment: asyncHandler(async (req, res) => {
    const exception = await exceptionsService.handleShipmentRejection(req.params.id);
    res.status(200).json({ success: true, message: 'Shipment rejected', data: exception });
  }),

  acceptPartial: asyncHandler(async (req, res) => {
    const exception = await exceptionsService.handlePartialAcceptance(req.params.id, req.body.acceptedQuantity);
    res.status(200).json({ success: true, message: 'Partial shipment accepted', data: exception });
  }),

  exportExceptions: asyncHandler(async (req, res) => {
    const exceptions = await exceptionsService.listExceptions();
    res.status(200).json({
      success: true,
      message: 'CSV export initiated',
      data: `id,priority,category,title,status\n${exceptions.map(e => `${e.id},${e.priority},${e.category},${e.title},${e.status}`).join('\n')}`
    });
  })
};

module.exports = exceptionsController;

