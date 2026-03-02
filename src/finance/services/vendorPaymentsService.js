const VendorInvoice = require('../models/VendorInvoice');
const Vendor = require('../models/Vendor');
const logger = require('../../utils/logger');

class VendorPaymentsService {
  async getPayablesSummary() {
    try {
      const outstanding = await VendorInvoice.find({
        status: { $in: ['pending_approval', 'approved', 'scheduled', 'overdue'] },
      }).lean();

      const pending = await VendorInvoice.find({
        status: 'pending_approval',
      }).lean();

      const overdue = await VendorInvoice.find({
        status: 'overdue',
      }).lean();

      const overdueVendors = new Set(overdue.map(i => i.vendorId.toString())).size;

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

      const [data, total] = await Promise.all([
        VendorInvoice.find(query)
          .sort({ dueDate: 1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        VendorInvoice.countDocuments(query),
      ]);

      return {
        data: data.map(invoice => ({
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
      const invoice = await VendorInvoice.findById(id).lean();
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const vendor = await Vendor.findById(invoice.vendorId).lean();

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
      const invoice = await VendorInvoice.findByIdAndUpdate(
        id,
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
      const result = await VendorInvoice.updateMany(
        {
          _id: { $in: ids },
          status: 'pending_approval',
        },
        { $set: { status: 'approved' } }
      );
      const approved = await VendorInvoice.find({ _id: { $in: ids } }).lean();
      return {
        approvedCount: result.modifiedCount,
        totalRequested: ids.length,
        data: approved.map(inv => ({
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
      const invoice = await VendorInvoice.findByIdAndUpdate(
        id,
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
      const invoice = await VendorInvoice.findByIdAndUpdate(
        id,
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
      const invoice = new VendorInvoice({
        ...data,
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
        request.invoices.map(inv =>
          VendorInvoice.findByIdAndUpdate(inv.invoiceId, {
            $set: { status: 'paid', paymentId },
          })
        )
      );

      return { success: true, paymentId };
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  async getVendors() {
    try {
      const vendors = await Vendor.find({ isActive: true }).lean();
      return vendors.map(vendor => ({
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

