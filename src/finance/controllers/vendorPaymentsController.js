const vendorPaymentsService = require('../services/vendorPaymentsService');
const Vendor = require('../models/Vendor');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class VendorPaymentsController {
  getPayablesSummary = asyncHandler(async (req, res) => {
    const summary = await vendorPaymentsService.getPayablesSummary();
    res.json({ success: true, data: summary });
  });

  getVendorInvoices = asyncHandler(async (req, res) => {
    const result = await vendorPaymentsService.getVendorInvoices(req.query);
    res.json({ success: true, data: result });
  });

  getVendorInvoiceDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await vendorPaymentsService.getVendorInvoiceDetails(id);
    res.json({ success: true, data: invoice });
  });

  approveInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await vendorPaymentsService.approveInvoice(id);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: invoice });
  });

  bulkApproveInvoices = asyncHandler(async (req, res) => {
    const { ids } = req.body;
    const result = await vendorPaymentsService.bulkApproveInvoices(ids);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: result });
  });

  rejectInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const invoice = await vendorPaymentsService.rejectInvoice(id, reason);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: invoice });
  });

  markInvoicePaid = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await vendorPaymentsService.markInvoicePaid(id);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: invoice });
  });

  uploadInvoice = asyncHandler(async (req, res) => {
    const vendor = req.body.vendorId ? await Vendor.findById(req.body.vendorId).lean() : null;
    const payload = {
      ...req.body,
      vendorName: vendor?.name || req.body.vendorName || 'Unknown Vendor',
      uploadedBy: req.user?.email || req.user?.userId || 'System',
    };
    const invoice = await vendorPaymentsService.uploadInvoice(payload);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.status(201).json({ success: true, data: invoice });
  });

  createPayment = asyncHandler(async (req, res) => {
    const result = await vendorPaymentsService.createPayment(req.body);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.status(201).json({ success: true, data: result });
  });

  getVendors = asyncHandler(async (req, res) => {
    const vendors = await vendorPaymentsService.getVendors();
    res.json({ success: true, data: vendors });
  });
}

module.exports = new VendorPaymentsController();

