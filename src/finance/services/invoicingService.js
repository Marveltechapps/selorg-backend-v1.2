const Invoice = require('../models/Invoice');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class InvoicingService {
  async getInvoiceSummary() {
    try {
      const [sent, pending, overdue, paid] = await Promise.all([
        Invoice.countDocuments({ status: 'sent' }),
        Invoice.countDocuments({ status: 'pending' }),
        Invoice.countDocuments({ status: 'overdue' }),
        Invoice.countDocuments({ status: 'paid' }),
      ]);

      return {
        sentCount: sent,
        pendingCount: pending,
        overdueCount: overdue,
        paidCount: paid,
        periodLabel: 'this month',
      };
    } catch (error) {
      logger.error('Error fetching invoice summary:', error);
      throw error;
    }
  }

  async getInvoices(status, search) {
    try {
      const query = {};

      if (status && status !== 'all') {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { invoiceNumber: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { customerEmail: { $regex: search, $options: 'i' } },
        ];
      }

      const invoices = await Invoice.find(query)
        .sort({ issueDate: -1 })
        .lean();

      return invoices.map(invoice => ({
        id: invoice._id.toString(),
        ...invoice,
      }));
    } catch (error) {
      logger.error('Error fetching invoices:', error);
      throw error;
    }
  }

  async getInvoiceDetails(id) {
    try {
      const invoice = await Invoice.findById(id).lean();
      if (!invoice) {
        return null;
      }
      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error fetching invoice details:', error);
      throw error;
    }
  }

  async createInvoice(payload, asDraft = false) {
    try {
      const amount = payload.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice * (1 + item.taxPercent / 100),
        0
      );

      const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now()}`;

      const invoice = new Invoice({
        customerId: payload.customerId || uuidv4(),
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        issueDate: new Date(payload.issueDate),
        dueDate: new Date(payload.dueDate),
        invoiceNumber,
        amount,
        currency: payload.currency || 'INR',
        status: asDraft ? 'draft' : 'sent',
        items: payload.items.map(item => ({ 
          id: uuidv4(),
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
        })),
        notes: payload.notes,
      });
      await invoice.save();

      return {
        id: invoice._id.toString(),
        ...invoice.toObject(),
      };
    } catch (error) {
      logger.error('Error creating invoice:', error);
      throw error;
    }
  }

  async updateInvoiceStatus(id, status) {
    try {
      const invoice = await Invoice.findByIdAndUpdate(
        id,
        { $set: { status } },
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
      logger.error('Error updating invoice status:', error);
      throw error;
    }
  }

  async sendInvoice(id) {
    try {
      return await this.updateInvoiceStatus(id, 'sent');
    } catch (error) {
      logger.error('Error sending invoice:', error);
      throw error;
    }
  }

  async sendReminder(id) {
    try {
      const invoice = await Invoice.findByIdAndUpdate(
        id,
        { $set: { lastReminderAt: new Date() } },
        { new: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error sending reminder:', error);
      throw error;
    }
  }

  async markInvoicePaid(id) {
    try {
      return await this.updateInvoiceStatus(id, 'paid');
    } catch (error) {
      logger.error('Error marking invoice as paid:', error);
      throw error;
    }
  }
}

module.exports = new InvoicingService();

