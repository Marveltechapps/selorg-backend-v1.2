const mongoose = require('mongoose');
const RefundRequest = require('../models/RefundRequest');
const ChargebackCase = require('../models/ChargebackCase');
const { buildDayRange } = require('../utils/financeEntityScope');
const { mapRefundDto } = require('../utils/refundDto');
const logger = require('../../utils/logger');

const PROCESSED_STATUSES = ['processed', 'completed'];
const OPEN_STATUSES = ['pending', 'approved', 'escalated'];

async function loadOrderMetaByIds(orderIds) {
  const unique = [...new Set(orderIds.filter(Boolean))];
  if (!unique.length) return new Map();

  try {
    const { Order } = require('../../customer-backend/models/Order');
    const objectIds = unique.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const orders = await Order.find({
      $or: [
        ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
        { orderNumber: { $in: unique } },
      ],
    })
      .select('orderNumber totalBill itemTotal refundAmount paymentMethod')
      .lean();

    const map = new Map();
    for (const order of orders) {
      const meta = {
        orderNumber: order.orderNumber,
        totalBill: order.totalBill,
        itemTotal: order.itemTotal,
        refundAmount: order.refundAmount,
        paymentMethod: order.paymentMethod,
      };
      map.set(String(order._id), meta);
      if (order.orderNumber) map.set(order.orderNumber, meta);
    }
    return map;
  } catch (err) {
    logger.warn('Could not load order meta for refunds', { err: err.message });
    return new Map();
  }
}

function orderMetaForRefund(refund, orderMap) {
  const key = String(refund.orderId ?? '');
  return orderMap.get(key) || orderMap.get(refund.orderNumber) || null;
}

function inferRefundMethod(refund, orderMeta) {
  if (refund.refundMethod) return refund.refundMethod;
  const methodType = orderMeta?.paymentMethod?.methodType;
  if (methodType === 'cash') return 'manual';
  if (methodType === 'wallet') return 'wallet';
  return 'original_payment';
}

class RefundsService {
  async getRefundsSummary() {
    try {
      const pending = await RefundRequest.countDocuments({ status: 'pending' });
      const activeChargebacks = await ChargebackCase.countDocuments({
        status: { $in: ['open', 'under_review'] },
      });

      const { startDate, endDate } = buildDayRange();

      const processedToday = await RefundRequest.find({
        status: { $in: PROCESSED_STATUSES },
        $or: [
          { processedAt: { $gte: startDate, $lte: endDate } },
          { completedAt: { $gte: startDate, $lte: endDate } },
          {
            updatedAt: { $gte: startDate, $lte: endDate },
            status: { $in: PROCESSED_STATUSES },
          },
        ],
      }).lean();

      const orderMap = await loadOrderMetaByIds(processedToday.map((r) => String(r.orderId)));
      const processedTodayAmount = processedToday.reduce((sum, r) => {
        const meta = orderMetaForRefund(r, orderMap);
        const dto = mapRefundDto(r, meta);
        return sum + (dto?.amount || 0);
      }, 0);

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
        if (filter.status === 'processed') {
          query.status = { $in: PROCESSED_STATUSES };
        } else if (filter.status === 'open') {
          query.status = { $in: OPEN_STATUSES };
        } else {
          query.status = filter.status;
        }
      }

      if (filter.reason && filter.reason !== 'all') {
        query.reasonCode = filter.reason;
      }

      if (filter.dateFrom || filter.dateTo) {
        query.requestedAt = {};
        if (filter.dateFrom) query.requestedAt.$gte = new Date(filter.dateFrom);
        if (filter.dateTo) query.requestedAt.$lte = new Date(filter.dateTo);
      }

      const q = String(filter.query || '').trim();
      if (q) {
        const or = [
          { orderNumber: { $regex: q, $options: 'i' } },
          { customerName: { $regex: q, $options: 'i' } },
          { customerEmail: { $regex: q, $options: 'i' } },
          { reasonText: { $regex: q, $options: 'i' } },
          { orderId: { $regex: q, $options: 'i' } },
        ];
        if (mongoose.Types.ObjectId.isValid(q)) {
          or.push({ _id: new mongoose.Types.ObjectId(q) });
          or.push({ orderId: q });
        }
        query.$or = or;
      }

      const page = Math.max(1, Number(filter.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const [rows, total] = await Promise.all([
        RefundRequest.find(query).sort({ requestedAt: -1 }).skip(skip).limit(pageSize).lean(),
        RefundRequest.countDocuments(query),
      ]);

      const orderMap = await loadOrderMetaByIds(rows.map((r) => String(r.orderId)));

      return {
        data: rows.map((refund) => {
          const meta = orderMetaForRefund(refund, orderMap);
          const dto = mapRefundDto(refund, meta);
          if (!dto.refundMethod || dto.refundMethod === 'original_payment') {
            dto.refundMethod = inferRefundMethod(refund, meta);
          }
          return dto;
        }),
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
      if (!refund) throw new Error('Refund request not found');

      const orderMap = await loadOrderMetaByIds([String(refund.orderId)]);
      const meta = orderMetaForRefund(refund, orderMap);
      const dto = mapRefundDto(refund, meta);
      dto.refundMethod = inferRefundMethod(refund, meta);
      return dto;
    } catch (error) {
      logger.error('Error fetching refund details:', error);
      throw error;
    }
  }

  async approveRefund(id, notes, partialAmount) {
    try {
      const refund = await RefundRequest.findById(id);
      if (!refund) throw new Error('Refund not found');

      if (partialAmount != null && partialAmount > 0) {
        refund.amount = partialAmount;
      } else if (!refund.amount || refund.amount <= 0) {
        const orderMap = await loadOrderMetaByIds([String(refund.orderId)]);
        const meta = orderMetaForRefund(refund, orderMap);
        const resolved = meta?.totalBill ?? meta?.itemTotal ?? 0;
        if (resolved > 0) refund.amount = resolved;
      }

      refund.status = 'approved';
      refund.processedAt = undefined;
      if (notes) refund.notes = notes;
      refund.timeline = refund.timeline || [];
      refund.timeline.push({
        status: 'approved',
        timestamp: new Date(),
        note: notes || 'Approved by finance',
      });
      await refund.save();

      try {
        const { sendRefundNotification } = require('../../customer-backend/services/notificationService');
        await sendRefundNotification(refund.customerId, 'REFUND_APPROVED', {
          amount: refund.amount,
          orderNumber: refund.orderNumber,
        });
      } catch (e) {
        /* non-blocking */
      }

      const orderMap = await loadOrderMetaByIds([String(refund.orderId)]);
      return mapRefundDto(refund.toObject(), orderMetaForRefund(refund, orderMap));
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
      refund.timeline.push({
        status: 'rejected',
        timestamp: new Date(),
        note: reason || 'Rejected by finance',
      });
      await refund.save();

      try {
        const { sendRefundNotification } = require('../../customer-backend/services/notificationService');
        await sendRefundNotification(refund.customerId, 'REFUND_REJECTED', {
          orderNumber: refund.orderNumber,
          reason: reason || 'Request did not meet criteria',
        });
      } catch (e) {
        /* non-blocking */
      }

      const orderMap = await loadOrderMetaByIds([String(refund.orderId)]);
      return mapRefundDto(refund.toObject(), orderMetaForRefund(refund, orderMap));
    } catch (error) {
      logger.error('Error rejecting refund:', error);
      throw error;
    }
  }

  async markCompleted(id, transactionId, notes) {
    try {
      const refund = await RefundRequest.findById(id);
      if (!refund) throw new Error('Refund not found');
      if (!['approved', 'processed', 'completed'].includes(refund.status)) {
        throw new Error('Refund must be approved before marking as completed');
      }

      const orderMap = await loadOrderMetaByIds([String(refund.orderId)]);
      const meta = orderMetaForRefund(refund, orderMap);
      if (!refund.amount || refund.amount <= 0) {
        const resolved = meta?.totalBill ?? meta?.itemTotal ?? 0;
        if (resolved > 0) refund.amount = resolved;
      }

      const method = inferRefundMethod(refund, meta);
      refund.refundMethod = method;
      refund.status = 'processed';
      refund.transactionId = transactionId || '';
      refund.processedAt = new Date();
      refund.completedAt = new Date();
      if (notes) refund.notes = `${refund.notes || ''} | Completed: ${notes}`.trim();
      refund.timeline = refund.timeline || [];
      refund.timeline.push({
        status: 'processed',
        timestamp: new Date(),
        note: notes || 'Refund processed by finance',
      });
      await refund.save();

      if (method === 'wallet' && refund.amount > 0) {
        try {
          const { creditWallet } = require('../../customer-backend/services/autoRefundService');
          await creditWallet(
            refund.customerId,
            refund.amount,
            String(refund._id),
            String(refund.orderId)
          );
        } catch (e) {
          logger.warn('Wallet credit failed during mark-completed', { err: e.message });
        }
      }

      try {
        const { Order } = require('../../customer-backend/models/Order');
        await Order.findByIdAndUpdate(refund.orderId, {
          refundStatus: 'processed',
          refundAmount: refund.amount,
          refundId: refund._id,
        });
      } catch (e) {
        /* non-blocking */
      }

      try {
        const { sendRefundNotification } = require('../../customer-backend/services/notificationService');
        const methodText = method === 'wallet' ? 'wallet' : 'bank account';
        await sendRefundNotification(refund.customerId, 'REFUND_COMPLETED', {
          amount: refund.amount,
          method: methodText,
        });
      } catch (e) {
        /* non-blocking */
      }

      return mapRefundDto(refund.toObject(), meta);
    } catch (error) {
      logger.error('Error marking refund completed:', error);
      throw error;
    }
  }

  async getChargebacks() {
    try {
      const chargebacks = await ChargebackCase.find().sort({ initiatedAt: -1 }).lean();
      return chargebacks.map((cb) => ({
        id: cb._id.toString(),
        ...cb,
        initiatedAt: cb.initiatedAt?.toISOString?.() || cb.initiatedAt,
      }));
    } catch (error) {
      logger.error('Error fetching chargebacks:', error);
      throw error;
    }
  }

  async getWalletTransactions(limit = 100) {
    try {
      const { WalletTransaction } = require('../../customer-backend/models/WalletTransaction');
      const { CustomerUser } = require('../../customer-backend/models/CustomerUser');

      const txns = await WalletTransaction.find()
        .sort({ createdAt: -1 })
        .limit(Math.min(200, Math.max(1, limit)))
        .lean();

      const customerIds = [...new Set(txns.map((t) => String(t.customerId)))];
      const users = customerIds.length
        ? await CustomerUser.find({ _id: { $in: customerIds } })
            .select('name email phone')
            .lean()
        : [];
      const userMap = new Map(users.map((u) => [String(u._id), u]));

      return txns.map((txn) => {
        const user = userMap.get(String(txn.customerId));
        return {
          id: String(txn._id),
          customerId: String(txn.customerId),
          customerName: user?.name || user?.email || String(txn.customerId),
          type: txn.type,
          amount: txn.amount,
          source: txn.source,
          reference: txn.referenceId || txn.description || '',
          orderId: txn.referenceType === 'order' ? txn.referenceId : undefined,
          description: txn.description,
          balanceAfter: txn.balanceAfter,
          createdAt: txn.createdAt?.toISOString?.() || txn.createdAt,
        };
      });
    } catch (error) {
      logger.error('Error fetching wallet transactions:', error);
      throw error;
    }
  }
}

module.exports = new RefundsService();
