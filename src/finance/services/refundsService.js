const RefundRequest = require('../models/RefundRequest');
const ChargebackCase = require('../models/ChargebackCase');
const logger = require('../../utils/logger');

class RefundsService {
  async getRefundsSummary() {
    try {
      const pending = await RefundRequest.countDocuments({ status: 'pending' });
      const activeChargebacks = await ChargebackCase.countDocuments({
        status: { $in: ['open', 'under_review'] },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const processedToday = await RefundRequest.find({
        status: 'processed',
        updatedAt: { $gte: today, $lt: tomorrow },
      }).lean();

      const processedTodayAmount = processedToday.reduce((sum, r) => sum + r.amount, 0);

      return {
        refundRequestsCount: pending,
        activeChargebacksCount: activeChargebacks,
        processedTodayAmount,
      };
    } catch (error) {
      logger.error('Error fetching refunds summary:', error);
      throw error;
    }
  }

  async getRefundQueue(filter) {
    try {
      const query = {};

      if (filter.status && filter.status !== 'all') {
        query.status = filter.status;
      }

      if (filter.reason && filter.reason !== 'all') {
        query.reasonCode = filter.reason;
      }

      if (filter.dateFrom || filter.dateTo) {
        query.requestedAt = {};
        if (filter.dateFrom) {
          query.requestedAt.$gte = new Date(filter.dateFrom);
        }
        if (filter.dateTo) {
          query.requestedAt.$lte = new Date(filter.dateTo);
        }
      }

      const page = filter.page || 1;
      const pageSize = filter.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const [data, total] = await Promise.all([
        RefundRequest.find(query)
          .sort({ requestedAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        RefundRequest.countDocuments(query),
      ]);

      return {
        data: data.map(refund => ({
          id: refund._id.toString(),
          ...refund,
        })),
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('Error fetching refund queue:', error);
      throw error;
    }
  }

  async getRefundDetails(id) {
    try {
      const refund = await RefundRequest.findById(id).lean();
      if (!refund) {
        throw new Error('Refund request not found');
      }
      return {
        id: refund._id.toString(),
        ...refund,
      };
    } catch (error) {
      logger.error('Error fetching refund details:', error);
      throw error;
    }
  }

  async approveRefund(id, notes, partialAmount) {
    try {
      const refund = await RefundRequest.findById(id);
      if (!refund) throw new Error('Refund not found');

      refund.status = 'approved';
      if (notes) refund.notes = notes;
      if (partialAmount) refund.amount = partialAmount;
      refund.timeline = refund.timeline || [];
      refund.timeline.push({ status: 'approved', timestamp: new Date(), note: notes || 'Approved by finance' });
      await refund.save();

      try {
        const { sendRefundNotification } = require('../../customer-backend/services/notificationService');
        await sendRefundNotification(refund.customerId, 'REFUND_APPROVED', {
          amount: refund.amount,
          orderNumber: refund.orderNumber,
        });
      } catch (e) { /* non-blocking */ }

      const result = refund.toObject();
      return { id: result._id.toString(), ...result };
    } catch (error) {
      logger.error('Error approving refund:', error);
      throw error;
    }
  }

  async rejectRefund(id, reason) {
    try {
      const refund = await RefundRequest.findById(id);
      if (!refund) throw new Error('Refund not found');

      refund.status = 'rejected';
      refund.rejectionReason = reason;
      refund.notes = `Rejected: ${reason}`;
      refund.timeline = refund.timeline || [];
      refund.timeline.push({ status: 'rejected', timestamp: new Date(), note: reason || 'Rejected by finance' });
      await refund.save();

      try {
        const { sendRefundNotification } = require('../../customer-backend/services/notificationService');
        await sendRefundNotification(refund.customerId, 'REFUND_REJECTED', {
          orderNumber: refund.orderNumber,
          reason: reason || 'Request did not meet criteria',
        });
      } catch (e) { /* non-blocking */ }

      const result = refund.toObject();
      return { id: result._id.toString(), ...result };
    } catch (error) {
      logger.error('Error rejecting refund:', error);
      throw error;
    }
  }

  async markCompleted(id, transactionId, notes) {
    try {
      const refund = await RefundRequest.findById(id);
      if (!refund) throw new Error('Refund not found');
      if (refund.status !== 'approved' && refund.status !== 'processed') {
        throw new Error('Refund must be approved before marking as completed');
      }

      refund.status = 'completed';
      refund.transactionId = transactionId || '';
      refund.completedAt = new Date();
      if (notes) refund.notes = (refund.notes || '') + ` | Completed: ${notes}`;
      refund.timeline = refund.timeline || [];
      refund.timeline.push({ status: 'completed', timestamp: new Date(), note: notes || 'Refund completed' });
      await refund.save();

      if (refund.refundMethod === 'wallet') {
        try {
          const { creditWallet } = require('../../customer-backend/services/autoRefundService');
          await creditWallet(refund.customerId, refund.amount, String(refund._id), String(refund.orderId));
        } catch (e) {
          logger.warn('Wallet credit failed during mark-completed', { err: e.message });
        }
      }

      try {
        const { Order } = require('../../customer-backend/models/Order');
        await Order.findByIdAndUpdate(refund.orderId, {
          refundStatus: 'processed',
        });
      } catch (e) { /* non-blocking */ }

      try {
        const { sendRefundNotification } = require('../../customer-backend/services/notificationService');
        const methodText = refund.refundMethod === 'wallet' ? 'wallet' : 'bank account';
        await sendRefundNotification(refund.customerId, 'REFUND_COMPLETED', {
          amount: refund.amount,
          method: methodText,
        });
      } catch (e) { /* non-blocking */ }

      const result = refund.toObject();
      return { id: result._id.toString(), ...result };
    } catch (error) {
      logger.error('Error marking refund completed:', error);
      throw error;
    }
  }

  async getChargebacks() {
    try {
      const chargebacks = await ChargebackCase.find()
        .sort({ initiatedAt: -1 })
        .lean();

      return chargebacks.map(cb => ({
        id: cb._id.toString(),
        ...cb,
      }));
    } catch (error) {
      logger.error('Error fetching chargebacks:', error);
      throw error;
    }
  }
}

module.exports = new RefundsService();

