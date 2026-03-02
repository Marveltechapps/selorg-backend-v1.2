const qcService = require('../services/qcService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc QC & Compliance Controller
 */
const qcController = {
  // Inspections
  getInspections: asyncHandler(async (req, res) => {
    const inspections = await qcService.listInspections();
    res.status(200).json({ success: true, count: inspections.length, data: inspections });
  }),

  createInspection: asyncHandler(async (req, res) => {
    const inspection = await qcService.createInspection(req.body);
    res.status(201).json({ success: true, data: inspection });
  }),

  getInspectionDetails: asyncHandler(async (req, res) => {
    const inspection = await qcService.getInspectionById(req.params.id);
    res.status(200).json({ success: true, data: inspection });
  }),

  updateInspection: asyncHandler(async (req, res) => {
    const inspection = await qcService.updateInspection(req.params.id, req.body);
    res.status(200).json({ success: true, data: inspection });
  }),

  // Temperature Logs
  getTemperatureLogs: asyncHandler(async (req, res) => {
    const logs = await qcService.listTemperatureLogs();
    res.status(200).json({ success: true, count: logs.length, data: logs });
  }),

  createTemperatureLog: asyncHandler(async (req, res) => {
    const log = await qcService.createTemperatureLog(req.body);
    res.status(201).json({ success: true, data: log });
  }),

  getTempChart: asyncHandler(async (req, res) => {
    const chartData = await qcService.getTempChartData(req.params.id, req.query.period);
    res.status(200).json({ success: true, data: chartData });
  }),

  // Rejections
  getRejections: asyncHandler(async (req, res) => {
    const rejections = await qcService.listRejections();
    res.status(200).json({ success: true, count: rejections.length, data: rejections });
  }),

  logRejection: asyncHandler(async (req, res) => {
    const rejection = await qcService.logRejection(req.body);
    res.status(201).json({ success: true, data: rejection });
  }),

  // Compliance Docs
  getComplianceDocs: asyncHandler(async (req, res) => {
    const docs = await qcService.listComplianceDocs();
    res.status(200).json({ success: true, count: docs.length, data: docs });
  }),

  getComplianceDoc: asyncHandler(async (req, res) => {
    const doc = await qcService.getComplianceDoc(req.params.id);
    res.status(200).json({ success: true, data: doc });
  }),

  // Sample Tests
  getSamples: asyncHandler(async (req, res) => {
    const samples = await qcService.listSamples();
    res.status(200).json({ success: true, count: samples.length, data: samples });
  }),

  createSample: asyncHandler(async (req, res) => {
    const sample = await qcService.createSample(req.body);
    res.status(201).json({ success: true, data: sample });
  }),

  updateSample: asyncHandler(async (req, res) => {
    const sample = await qcService.updateSample(req.params.id, req.body);
    res.status(200).json({ success: true, data: sample });
  }),

  // Compliance Checks
  getComplianceChecks: asyncHandler(async (req, res) => {
    const checks = await qcService.listComplianceChecks();
    res.status(200).json({ success: true, data: checks, checks });
  }),

  toggleComplianceCheck: asyncHandler(async (req, res) => {
    const { completed } = req.body;
    const check = await qcService.toggleComplianceCheck(req.params.id, completed, req.body.inspector || 'Current User');
    res.status(200).json({ success: true, data: check });
  })
};

module.exports = qcController;

