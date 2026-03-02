const CustomerPayment = require('../models/CustomerPayment');
const logger = require('../../utils/logger');

class CustomerPaymentsService {
  async getCustomerPayments(filter) {
    try {
      const query = {};
      
      if (filter.query) {
        query.$or = [
          { customerName: { $regex: filter.query, $options: 'i' } },
          { customerEmail: { $regex: filter.query, $options: 'i' } },
          { orderId: { $regex: filter.query, $options: 'i' } },
          { paymentMethodDisplay: { $regex: filter.query, $options: 'i' } },
        ];
      }

      if (filter.status && filter.status !== 'all') {
        query.status = filter.status;
      }

      if (filter.dateFrom || filter.dateTo) {
        query.createdAt = {};
        if (filter.dateFrom) {
          query.createdAt.$gte = new Date(filter.dateFrom);
        }
        if (filter.dateTo) {
          query.createdAt.$lte = new Date(filter.dateTo);
        }
      }

      if (filter.methodType && filter.methodType !== 'all') {
        query.methodType = filter.methodType;
      }

      const page = filter.page || 1;
      const pageSize = filter.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const [data, total] = await Promise.all([
        CustomerPayment.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        CustomerPayment.countDocuments(query),
      ]);

      return {
        data: data.map(payment => ({
          id: payment._id.toString(),
          ...payment,
        })),
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('Error fetching customer payments:', error);
      throw error;
    }
  }

  async getCustomerPaymentDetails(id) {
    try {
      const payment = await CustomerPayment.findById(id).lean();
      if (!payment) {
        throw new Error('Payment not found');
      }
      return {
        id: payment._id.toString(),
        ...payment,
      };
    } catch (error) {
      logger.error('Error fetching customer payment details:', error);
      throw error;
    }
  }

  async retryCustomerPayment(id, amount) {
    try {
      const payment = await CustomerPayment.findById(id);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!payment.retryEligible && payment.status !== 'declined' && payment.status !== 'pending') {
        throw new Error('Payment is not eligible for retry');
      }

      payment.status = 'pending';
      if (amount) {
        payment.amount = amount;
      }
      payment.retryEligible = false;
      payment.lastUpdatedAt = new Date();
      await payment.save();

      return {
        id: payment._id.toString(),
        ...payment.toObject(),
      };
    } catch (error) {
      logger.error('Error retrying customer payment:', error);
      throw error;
    }
  }
}

module.exports = new CustomerPaymentsService();

