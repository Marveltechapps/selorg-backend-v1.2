const reportsService = require('../services/reportsService');
const { resolveStoreId } = require('../utils/reportDateRange');
const logger = require('../../core/utils/logger');

const VALID_RANGES = new Set(['today', '7d', '30d']);

function normalizeRange(raw) {
  const value = String(raw || 'today').trim();
  return VALID_RANGES.has(value) ? value : 'today';
}

const getInventoryReport = async (req, res) => {
  try {
    const storeId = resolveStoreId(req.query.storeId);
    const range = normalizeRange(req.query.range);
    const data = await reportsService.getInventoryReport(storeId, range);
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error('Reports inventory error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to load inventory report' });
  }
};

const getStaffReport = async (req, res) => {
  try {
    const storeId = resolveStoreId(req.query.storeId);
    const range = normalizeRange(req.query.range);
    const data = await reportsService.getStaffReport(storeId, range);
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error('Reports staff error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to load staff report' });
  }
};

const getComplianceReport = async (req, res) => {
  try {
    const storeId = resolveStoreId(req.query.storeId);
    const range = normalizeRange(req.query.range);
    const data = await reportsService.getComplianceReport(storeId, range, {
      category: req.query.category || 'all',
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error('Reports compliance error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to load compliance report' });
  }
};

const exportReports = async (req, res) => {
  try {
    const storeId = resolveStoreId(req.query.storeId);
    const range = normalizeRange(req.query.range);
    const rows = await reportsService.buildExportRows(storeId, range);

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const dateStamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=darkstore-reports-${range}-${dateStamp}.csv`
    );
    res.status(200).send(csv);
  } catch (error) {
    logger.error('Reports export error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to export reports' });
  }
};

module.exports = {
  getInventoryReport,
  getStaffReport,
  getComplianceReport,
  exportReports,
};
