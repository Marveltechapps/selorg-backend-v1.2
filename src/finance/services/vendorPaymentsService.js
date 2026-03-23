const mongoose = require('mongoose');
const VendorInvoice = require('../models/VendorInvoice');
const Vendor = require('../models/Vendor');
const logger = require('../../utils/logger');
const { mergeHubFilter, hubFieldsForCreate } = require('../../vendor/constants/hubScope');

function toObjectIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
}

class VendorPaymentsService {
  async getPayablesSummary() {
    try {
      const outstanding = await VendorInvoice.find(
        mergeHubFilter({
          status: { $in: ['pending_approval', 'approved', 'scheduled', 'overdue'] },
        })
      ).lean();

      const pending = await VendorInvoice.find(mergeHubFilter({ status: 'pending_approval' })).lean();

      const overdue = await VendorInvoice.find(mergeHubFilter({ status: 'overdue' })).lean();

      const overdueVendors = new Set(overdue.map((i) => i.vendorId.toString())).size;

      return {
        outstandingPayablesAmount: outstanding.reduce((sum, inv) => sum + inv.amount, 0),
        outstandingHorizonText: 'Due next 30 days',
        pendingApprovalCount: pending.length,
        overdueAmount: overdue.reduce((sum, inv) => sum + inv.amount, 0),
        overdueVendorsCount: overdueVendors,
      };
    } catch (error) {
      logger.error('Error fetching payables summary:', error);
      throw error;
    }
  }

  async getVendorInvoices(filter) {
    try {
      const query = {};

      if (filter.status && filter.status !== 'all') {
        query.status = filter.status;
      }

      if (filter.vendorId && filter.vendorId !== 'all') {
        query.vendorId = filter.vendorId;
      }

      if (filter.dateFrom || filter.dateTo) {
        query.invoiceDate = {};
        if (filter.dateFrom) {
          query.invoiceDate.$gte = new Date(filter.dateFrom);
        }
        if (filter.dateTo) {
          query.invoiceDate.$lte = new Date(filter.dateTo);
        }
      }

      const page = filter.page || 1;
      const pageSize = filter.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const scoped = mergeHubFilter(query);

      const [data, total] = await Promise.all([
        VendorInvoice.find(scoped).sort({ dueDate: 1 }).skip(skip).limit(pageSize).lean(),
        VendorInvoice.countDocuments(scoped),
      ]);

      return {
        data: data.map((invoice) => ({
          id: invoice._id.toString(),
          ...invoice,
        })),
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('Error fetching vendor invoices:', error);
      throw error;
    }
  }

  async getVendorInvoiceDetails(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOne(mergeHubFilter({ _id: id })).lean();
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      let vendor = null;
      if (invoice.vendorId && mongoose.Types.ObjectId.isValid(String(invoice.vendorId))) {
        vendor = await Vendor.findOne(mergeHubFilter({ _id: invoice.vendorId })).lean();
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
        vendorDetails: vendor,
      };
    } catch (error) {
      logger.error('Error fetching vendor invoice details:', error);
      throw error;
    }
  }

  async approveInvoice(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOneAndUpdate(
        mergeHubFilter({ _id: id }),
        { $set: { status: 'approved' } },
        { new: true, runValidators: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error approving invoice:', error);
      throw error;
    }
  }

  async bulkApproveInvoices(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids array is required and must not be empty');
      }
      const objectIds = toObjectIds(ids);
      if (objectIds.length === 0) {
        throw new Error('No valid invoice ids');
      }
      const result = await VendorInvoice.updateMany(
        mergeHubFilter({
          _id: { $in: objectIds },
          status: 'pending_approval',
        }),
        { $set: { status: 'approved' } }
      );
      const approved = await VendorInvoice.find(mergeHubFilter({ _id: { $in: objectIds } })).lean();
      return {
        approvedCount: result.modifiedCount,
        totalRequested: ids.length,
        data: approved.map((inv) => ({
          id: inv._id.toString(),
          ...inv,
        })),
      };
    } catch (error) {
      logger.error('Error bulk approving invoices:', error);
      throw error;
    }
  }

  async rejectInvoice(id, reason) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOneAndUpdate(
        mergeHubFilter({ _id: id }),
        { $set: { status: 'rejected', notes: reason } },
        { new: true, runValidators: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error rejecting invoice:', error);
      throw error;
    }
  }

  async markInvoicePaid(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOneAndUpdate(
        mergeHubFilter({ _id: id }),
        { $set: { status: 'paid', paymentId: `pay_${Date.now()}` } },
        { new: true, runValidators: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error marking invoice as paid:', error);
      throw error;
    }
  }

  async uploadInvoice(data) {
    try {
      const raw = data && typeof data === 'object' ? { ...data } : {};
      delete raw.hubKey;
      delete raw._id;
      const invoice = new VendorInvoice({
        ...raw,
        ...hubFieldsForCreate(),
        status: 'pending_approval',
        uploadedAt: new Date(),
      });
      await invoice.save();

      return {
        id: invoice._id.toString(),
        ...invoice.toObject(),
      };
    } catch (error) {
      logger.error('Error uploading invoice:', error);
      throw error;
    }
  }

  async createPayment(request) {
    try {
      const paymentId = `pay_${Date.now()}`;

      await Promise.all(
        (request.invoices || []).map(async (inv) => {
          if (!inv.invoiceId || !mongoose.Types.ObjectId.isValid(String(inv.invoiceId))) {
            throw new Error('Invalid invoice id in payment request');
          }
          const updated = await VendorInvoice.findOneAndUpdate(
            mergeHubFilter({ _id: inv.invoiceId }),
            { $set: { status: 'paid', paymentId } },
            { new: true }
          ).lean();
          if (!updated) {
            throw new Error(`Invoice ${inv.invoiceId} not found in this hub`);
          }
        })
      );

      return { success: true, paymentId };
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  async getVendors() {
    try {
      const vendors = await Vendor.find(mergeHubFilter({ isActive: true })).lean();
      return vendors.map((vendor) => ({
        id: vendor._id.toString(),
        ...vendor,
      }));
    } catch (error) {
      logger.error('Error fetching vendors:', error);
      throw error;
    }
  }
}

module.exports = new VendorPaymentsService();
