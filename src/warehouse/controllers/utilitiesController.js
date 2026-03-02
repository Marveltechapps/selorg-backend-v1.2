const utilitiesService = require('../services/utilitiesService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Warehouse Utilities Controller
 */
const utilitiesController = {
  getZones: asyncHandler(async (req, res) => {
    const zones = await utilitiesService.getZones();
    res.status(200).json({ success: true, data: zones });
  }),

  uploadSKUs: asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const result = await utilitiesService.uploadSKUs(req.file);
    res.status(200).json({ success: true, ...result });
  }),

  getLogs: asyncHandler(async (req, res) => {
    const logs = await utilitiesService.getAccessLogs(req.query);
    const data = logs.map(l => {
      const doc = l.toObject ? l.toObject() : l;
      return {
        id: doc.id ?? doc._id?.toString?.() ?? '',
        user: doc.user ?? '',
        action: doc.action ?? '',
        details: doc.details ?? '',
        timestamp: doc.timestamp ? (typeof doc.timestamp === 'string' ? doc.timestamp : doc.timestamp.toISOString?.() ?? '') : '',
      };
    });
    res.status(200).json({ success: true, count: data.length, data });
  }),

  generateLabels: asyncHandler(async (req, res) => {
    const result = await utilitiesService.generateLabels(req.body);
    res.status(200).json({ success: true, ...result });
  }),

  reassignBins: asyncHandler(async (req, res) => {
    const result = await utilitiesService.reassignBins(req.body);
    res.status(200).json({ success: true, ...result });
  }),

  printBarcodes: asyncHandler(async (req, res) => {
    const result = await utilitiesService.printBarcodes(req.body);
    res.status(200).json({ success: true, ...result });
  })
};

module.exports = utilitiesController;

