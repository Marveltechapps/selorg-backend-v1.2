const inboundService = require('../services/inboundService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Inbound Operations Controller
 */
const inboundController = {
  /**
   * @route   GET /api/v1/inbound/grns
   * @desc    List all GRNs
   */
  getGRNs: asyncHandler(async (req, res) => {
    const pagination = { page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 50 };
    const result = await inboundService.listGRNs({ ...req.query, ...pagination });
    res.status(200).json({
      success: true,
      data: result.items || [],
      meta: {
        total: result.total || 0,
        page: result.page || 1,
        limit: result.limit || 50,
        totalPages: result.totalPages || 0,
      },
    });
  }),

  /**
   * @route   POST /api/v1/inbound/grns
   * @desc    Create new GRN
   */
  createGRN: asyncHandler(async (req, res) => {
    const grn = await inboundService.createGRN(req.body);
    res.status(201).json({ success: true, data: grn });
  }),

  /**
   * @route   GET /api/v1/inbound/grns/:id
   * @desc    Get GRN details
   */
  getGRNDetails: asyncHandler(async (req, res) => {
    const grn = await inboundService.getGRNById(req.params.id);
    res.status(200).json({
      success: true,
      data: grn
    });
  }),

  /**
   * @route   POST /api/v1/inbound/grns/:id/start
   * @desc    Start counting for GRN
   */
  startGRNCounting: asyncHandler(async (req, res) => {
    const grn = await inboundService.startCounting(req.params.id);
    res.status(200).json({ success: true, data: grn, meta: { message: 'Counting started' } });
  }),

  /**
   * @route   POST /api/v1/inbound/grns/:id/complete
   * @desc    Complete GRN
   */
  completeGRN: asyncHandler(async (req, res) => {
    const grn = await inboundService.completeGRN(req.params.id);
    res.status(200).json({ success: true, data: grn, meta: { message: 'GRN marked as completed' } });
  }),

  /**
   * @route   POST /api/v1/inbound/grns/:id/discrepancy
   * @desc    Log discrepancy for GRN
   */
  logGRNDiscrepancy: asyncHandler(async (req, res) => {
    const grn = await inboundService.logDiscrepancy(req.params.id, req.body);
    res.status(200).json({ success: true, data: grn, meta: { message: 'Discrepancy logged' } });
  }),

  /**
   * @route   GET /api/v1/inbound/docks
   * @desc    Get dock status
   */
  getDocks: asyncHandler(async (req, res) => {
    const pagination = { page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 50 };
    const result = await inboundService.listDocks(pagination);
    res.status(200).json({
      success: true,
      data: result.items || [],
      meta: {
        total: result.total || 0,
        page: result.page || 1,
        limit: result.limit || 50,
        totalPages: result.totalPages || 0,
      },
    });
  }),

  /**
   * @route   PUT /api/v1/inbound/docks/:id
   * @desc    Update dock status
   */
  updateDock: asyncHandler(async (req, res) => {
    const dock = await inboundService.updateDock(req.params.id, req.body);
    res.status(200).json({ success: true, data: dock, meta: { message: 'Dock updated successfully' } });
  }),

  /**
   * @route   GET /api/v1/inbound/grns/export
   * @desc    Export GRNs to CSV (Mock)
   */
  exportGRNs: asyncHandler(async (req, res) => {
    const grns = await inboundService.listGRNs(req.query);
    // In a real system, generate CSV and stream it
    const csv = `id,poNumber,vendor,status,items\n${grns.map(g => `${g.id},${g.poNumber},${g.vendor},${g.status},${g.items}`).join('\n')}`;
    res.status(200).json({ success: true, data: { csv }, meta: { message: 'CSV export initiated' } });
  })
};

module.exports = inboundController;

