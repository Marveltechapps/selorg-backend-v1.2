const WarehouseException = require('../models/WarehouseException');
const ErrorResponse = require("../../core/utils/ErrorResponse");
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

/**
 * @desc Exception Management Service
 */
const exceptionsService = {
  listExceptions: async (warehouseKey, filters = {}) => {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    const items = await WarehouseException.find(mergeWarehouseFilter(query, warehouseKey))
      .sort({ createdAt: -1 })
      .lean();
    return items.map(e => ({
      id: e.id,
      priority: e.priority,
      category: e.category,
      title: e.title,
      description: e.description,
      status: e.status,
      timestamp: e.reportedAt || e.createdAt ? new Date(e.reportedAt || e.createdAt).toISOString() : new Date().toISOString()
    }));
  },

  reportException: async (warehouseKey, data) => {
    if (!data.id) {
      const count = await WarehouseException.countDocuments(warehouseKeyMatch(warehouseKey));
      data.id = `EXC-${(count + 1).toString().padStart(3, '0')}`;
    }
    return await WarehouseException.create({ ...data, ...warehouseFieldsForCreate(warehouseKey) });
  },

  getExceptionById: async (warehouseKey, id) => {
    const exception = await WarehouseException.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!exception) throw new ErrorResponse(`Exception not found with id ${id}`, 404);
    return exception;
  },

  updateStatus: async (warehouseKey, id, status) => {
    const exception = await WarehouseException.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!exception) throw new ErrorResponse(`Exception not found with id ${id}`, 404);
    
    exception.status = status;
    if (status === 'resolved' || status === 'closed') {
      exception.resolvedAt = new Date();
    }
    await exception.save();
    return exception;
  },

  handleShipmentRejection: async (warehouseKey, id) => {
    const exception = await WarehouseException.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!exception) throw new ErrorResponse(`Exception not found with id ${id}`, 404);
    
    // Logic for rejecting shipment
    exception.status = 'resolved';
    exception.resolutionNotes = 'Shipment rejected due to critical discrepancy';
    exception.resolvedAt = new Date();
    await exception.save();
    return exception;
  },

  handlePartialAcceptance: async (warehouseKey, id, acceptedQuantity) => {
    const exception = await WarehouseException.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!exception) throw new ErrorResponse(`Exception not found with id ${id}`, 404);
    
    // Logic for partial acceptance
    exception.status = 'resolved';
    exception.resolutionNotes = `Partial shipment accepted (${acceptedQuantity} items)`;
    exception.resolvedAt = new Date();
    await exception.save();
    return exception;
  }
};

module.exports = exceptionsService;

