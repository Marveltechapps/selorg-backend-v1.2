const outboundService = require('../services/outboundService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Outbound Operations Controller
 */
const outboundController = {
  /**
   * @route   GET /api/v1/outbound/picklists
   * @desc    List all picklists
   */
  getPicklists: asyncHandler(async (req, res) => {
    const picklists = await outboundService.listPicklists(req.query);
    res.status(200).json({ success: true, data: picklists, meta: { count: picklists.length } });
  }),

  /**
   * @route   GET /api/v1/outbound/picklists/:id
   * @desc    Get picklist details
   */
  getPicklistDetails: asyncHandler(async (req, res) => {
    const picklist = await outboundService.getPicklistById(req.params.id);
    res.status(200).json({ success: true, data: picklist });
  }),

  /**
   * @route   POST /api/v1/outbound/picklists/:id/assign
   * @desc    Assign picker to order
   */
  assignPicker: asyncHandler(async (req, res) => {
    const { pickerId, pickerName } = req.body;
    const picker = pickerId || pickerName;
    const picklist = await outboundService.assignPicker(req.params.id, picker);
    res.status(200).json({ success: true, data: picklist, meta: { message: 'Picker assigned successfully' } });
  }),

  /**
   * @route   GET /api/v1/outbound/batches
   * @desc    List all batches
   */
  listBatches: asyncHandler(async (req, res) => {
    const batches = await outboundService.listBatches(req.query);
    res.status(200).json({ success: true, data: batches, meta: { count: batches.length } });
  }),

  /**
   * @route   POST /api/v1/outbound/batches
   * @desc    Create new picking batch
   */
  createBatch: asyncHandler(async (req, res) => {
    const batch = await outboundService.createBatch(req.body);
    res.status(201).json({ success: true, data: batch });
  }),

  /**
   * @route   GET /api/v1/outbound/batches/:id
   * @desc    Get batch details
   */
  getBatchDetails: asyncHandler(async (req, res) => {
    const batch = await outboundService.getBatchById(req.params.id);
    res.status(200).json({ success: true, data: batch });
  }),

  /**
   * @route   GET /api/v1/outbound/pickers
   * @desc    Get picker status
   */
  getPickers: asyncHandler(async (req, res) => {
    const pickers = await outboundService.listPickers();
    res.status(200).json({ success: true, data: pickers, meta: { count: pickers.length } });
  }),

  /**
   * @route   GET /api/v1/outbound/pickers/:id/orders
   * @desc    Get orders for a specific picker
   */
  getPickerOrders: asyncHandler(async (req, res) => {
    const orders = await outboundService.getPickerOrders(req.params.id);
    res.status(200).json({ success: true, data: orders, meta: { count: orders.length } });
  }),

  /**
   * @route   GET /api/v1/outbound/routes/active/map
   * @desc    Get all active routes
   */
  getActiveRoutes: asyncHandler(async (req, res) => {
    const routes = await outboundService.getActiveRoutes();
    res.status(200).json({ success: true, data: routes, meta: { count: routes.length } });
  }),

  /**
   * @route   GET /api/v1/outbound/routes/:id/map
   * @desc    Get route map data
   */
  getRouteMap: asyncHandler(async (req, res) => {
    const mapData = await outboundService.getRouteMap(req.params.id);
    res.status(200).json({ success: true, data: mapData });
  }),

  /**
   * @route   GET /api/v1/outbound/consolidated-picks
   * @desc    Get consolidated multi-order picks
   */
  getConsolidatedPicks: asyncHandler(async (req, res) => {
    const picks = await outboundService.getConsolidatedPicks(req.query);
    res.status(200).json({ success: true, data: picks, meta: { count: picks.length } });
  })
};

module.exports = outboundController;

