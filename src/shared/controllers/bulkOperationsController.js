const bulkOperationsService = require('../services/bulkOperationsService');
const { asyncHandler } = require('../../core/middleware');

/**
 * Bulk Operations Controller
 */

/**
 * @route   POST /api/v1/shared/bulk/orders
 * @desc    Bulk update orders
 * @access  Private
 */
const bulkUpdateOrders = asyncHandler(async (req, res) => {
  const { orderIds, updates } = req.body;

  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'orderIds array is required',
    });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'updates object is required',
    });
  }

  const result = await bulkOperationsService.bulkUpdateOrders(orderIds, updates);

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @route   POST /api/v1/shared/bulk/products
 * @desc    Bulk update products
 * @access  Private
 */
const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const { productIds, updates } = req.body;

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'productIds array is required',
    });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'updates object is required',
    });
  }

  const result = await bulkOperationsService.bulkUpdateProducts(productIds, updates);

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @route   POST /api/v1/shared/bulk/inventory
 * @desc    Bulk update inventory
 * @access  Private
 */
const bulkUpdateInventory = asyncHandler(async (req, res) => {
  const { items, operation = 'set' } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'items array is required',
    });
  }

  const results = await bulkOperationsService.bulkUpdateInventory(items, operation);

  res.status(200).json({
    success: true,
    data: results,
  });
});

/**
 * @route   POST /api/v1/shared/bulk/import/products
 * @desc    Bulk import products
 * @access  Private
 */
const bulkImportProducts = asyncHandler(async (req, res) => {
  const { products } = req.body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'products array is required',
    });
  }

  const results = await bulkOperationsService.bulkImportProducts(products);

  res.status(200).json({
    success: true,
    data: results,
  });
});

/**
 * @route   GET /api/v1/shared/bulk/export/:type
 * @desc    Bulk export data
 * @access  Private
 */
const bulkExport = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { format = 'csv', ...filters } = req.query;

  const result = await bulkOperationsService.bulkExport(type, filters, format);

  // Set response headers for download
  res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

  if (format === 'json') {
    res.status(200).json({
      success: true,
      data: result.data,
      count: result.count,
    });
  } else {
    // Convert to CSV (simplified)
    const csv = this.convertToCSV(result.data);
    res.status(200).send(csv);
  }
});

/**
 * @route   DELETE /api/v1/shared/bulk/:type
 * @desc    Bulk delete
 * @access  Private
 */
const bulkDelete = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'ids array is required',
    });
  }

  const result = await bulkOperationsService.bulkDelete(type, ids);

  res.status(200).json({
    success: true,
    data: result,
  });
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    })
  );

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

module.exports = {
  bulkUpdateOrders,
  bulkUpdateProducts,
  bulkUpdateInventory,
  bulkImportProducts,
  bulkExport,
  bulkDelete,
};
