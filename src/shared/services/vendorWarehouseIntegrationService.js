/**
 * Vendor PO → Warehouse GRN Integration Service
 * When Vendor marks PO as received, creates Warehouse GRN and links to Vendor receipt
 * Warehouse staff completes GRN and updates inventory through normal inbound flow
 */
const inboundService = require('../../warehouse/services/inboundService');
const Vendor = require('../../vendor/models/Vendor');
const logger = require('../../core/utils/logger');

async function createWarehouseGRNFromVendorPO(po) {
  if (!po || !po._id) {
    logger.warn('createWarehouseGRNFromVendorPO: invalid PO');
    return null;
  }

  let vendorName = po.vendorId;
  try {
    const vendor = await Vendor.findById(po.vendorId).lean();
    if (vendor) vendorName = vendor.name;
    else {
      const vendorByCode = await Vendor.findOne({ code: po.vendorId }).lean();
      if (vendorByCode) vendorName = vendorByCode.name;
    }
  } catch (err) {
    logger.warn('createWarehouseGRNFromVendorPO: could not resolve vendor name', { vendorId: po.vendorId });
  }

  const poNumber = po.reference || po.externalReference || `PO-${po._id}`;
  const itemCount = (po.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0) || (po.items || []).length || 0;

  try {
    const grn = await inboundService.createGRN({
      poNumber,
      vendor: vendorName,
      items: itemCount,
      vendorPOId: po._id,
    });
    logger.info('Warehouse GRN created from Vendor PO receipt', {
      grnId: grn.id,
      poId: po._id,
      poNumber,
      vendor: vendorName,
      items: itemCount,
    });
    return grn;
  } catch (err) {
    logger.error('createWarehouseGRNFromVendorPO failed', {
      poId: po._id,
      error: err.message,
    });
    throw err;
  }
}

module.exports = {
  createWarehouseGRNFromVendorPO,
};
