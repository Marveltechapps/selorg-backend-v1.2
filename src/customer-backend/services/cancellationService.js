const RefundRequest = require('../../finance/models/RefundRequest');
const { CancellationPolicy } = require('../models/CancellationPolicy');
const { Order } = require('../models/Order');
const { CustomerUser } = require('../models/CustomerUser');
const { sendOrderStatusNotification, sendRefundNotification } = require('./notificationService');
const { creditWallet } = require('./autoRefundService');
const { restoreCartFromOrder } = require('./cartService');

function roundMoney(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/** Daily cancel cap per user (calendar day). Default 1000; override with CUSTOMER_MAX_CANCELLATIONS_PER_DAY. */
function getEffectiveMaxCancellationsPerDay() {
  const raw = process.env.CUSTOMER_MAX_CANCELLATIONS_PER_DAY;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 1000;
}

async function getActivePolicy(paymentMethod) {
  let policy = await CancellationPolicy.findOne({
    isActive: true,
    appliesTo: paymentMethod || 'all',
  }).lean();

  if (!policy) {
    policy = await CancellationPolicy.findOne({
      isActive: true,
      appliesTo: 'all',
    }).lean();
  }

  const base =
    policy || {
      allowedStatuses: ['pending', 'confirmed'],
      freeWindowMinutes: 2,
      cancellationFeePercent: 0,
      maxCancellationFee: 0,
      maxCancellationsPerDay: 1000,
      customerCanCancel: true,
      autoRefundOnCancel: true,
      refundMethod: 'original_payment',
    };

  return { ...base, maxCancellationsPerDay: getEffectiveMaxCancellationsPerDay() };
}

/** Darkstore / ops stages where customer cancel must be blocked even if the
 *  customer-facing status is still `confirmed` (e.g. PICKING maps to confirmed). */
const NON_CANCELLABLE_FULFILLMENT_STATUSES = new Set([
  'PICKING',
  'PICKED',
  'PACKED',
  'READY_FOR_DISPATCH',
  'ready',
  'completed',
  'OUT_FOR_DELIVERY',
  'out-for-delivery',
  'on-the-way',
  'DISPATCHED',
]);

async function canCustomerCancel(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, userId }).lean();
  if (!order) return { allowed: false, reason: 'Order not found' };

  const policy = await getActivePolicy(order.paymentMethod?.methodType);

  if (!policy.customerCanCancel) {
    return { allowed: false, reason: 'Customer cancellation is not allowed' };
  }

  if (!policy.allowedStatuses.includes(order.status)) {
    return { allowed: false, reason: `Cannot cancel order in "${order.status}" status` };
  }

  // Block cancel once darkstore has started picking/packing even while the
  // customer order status remains `confirmed`.
  if (order.orderNumber) {
    try {
      const DarkstoreOrder = require('../../darkstore/models/Order');
      const dsOrder = await DarkstoreOrder.findOne({ order_id: order.orderNumber })
        .select('status')
        .lean();
      if (dsOrder && NON_CANCELLABLE_FULFILLMENT_STATUSES.has(String(dsOrder.status || ''))) {
        return {
          allowed: false,
          reason: `Cannot cancel order while fulfillment is in "${dsOrder.status}" status`,
        };
      }
    } catch (e) {
      // Darkstore model may be unavailable in some test harnesses — policy status still applies.
    }
  }

  const orderAge = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  const isPastFreeWindow = orderAge > policy.freeWindowMinutes;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysCancellations = await Order.countDocuments({
    userId,
    status: 'cancelled',
    updatedAt: { $gte: todayStart },
  });

  if (todaysCancellations >= policy.maxCancellationsPerDay) {
    return { allowed: false, reason: 'Daily cancellation limit reached' };
  }

  let cancellationFee = 0;
  if (isPastFreeWindow && policy.cancellationFeePercent > 0) {
    cancellationFee = Math.min(
      order.totalBill * (policy.cancellationFeePercent / 100),
      policy.maxCancellationFee || Infinity
    );
  }

  return { allowed: true, cancellationFee, isPastFreeWindow, policy };
}

async function createCancelRefundRequest(order, refundAmount, refundMethod, reason) {
  const user = await CustomerUser.findById(order.userId).lean();
  const existing = await RefundRequest.findOne({
    orderId: String(order._id),
    customerId: String(order.userId),
    status: { $in: ['pending', 'approved', 'processed'] },
  });
  if (existing) return existing;

  return RefundRequest.create({
    orderId: String(order._id),
    orderNumber: order.orderNumber || '',
    customerId: String(order.userId),
    customerName: user?.name || user?.email || user?.phoneNumber || 'Customer',
    customerEmail: user?.email || '',
    customerPhone: user?.phoneNumber || '',
    reasonCode: 'customer_cancelled',
    reasonText: reason || 'Cancelled by customer',
    amount: refundAmount,
    currency: 'INR',
    status: 'pending',
    channel: 'self_service',
    refundMethod: refundMethod === 'wallet' ? 'wallet' : 'original_payment',
    timeline: [
      {
        status: 'pending',
        timestamp: new Date(),
        actor: 'customer',
        note: 'Auto-created from customer order cancellation',
      },
    ],
  });
}

async function executeCancellation(userId, orderId, reason = '') {
  const check = await canCustomerCancel(userId, orderId);
  if (!check.allowed) return { error: check.reason };

  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) return { error: 'Order not found' };

  order.status = 'cancelled';
  order.cancellationReason = reason || 'Cancelled by customer';
  order.timeline.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: reason || 'Cancelled by customer',
    actor: 'customer',
  });

  const isUnreleasedGateway =
    order.fulfillmentReleased === false &&
    (order.paymentMethod?.methodType === 'card' ||
      order.paymentMethod?.methodType === 'upi' ||
      order.paymentMethod?.methodType === 'digital');
  if (isUnreleasedGateway) {
    order.paymentStatus = 'failed';
  }

  // Unpaid partial-wallet orders: restore wallet debit when customer cancels before online pay.
  if (isUnreleasedGateway && Number(order.walletDeduction) > 0 && !order.walletRefundedAt) {
    try {
      const { refundWalletForFailedOrderPayment } = require('./walletService');
      const claimedRefund = await Order.findOneAndUpdate(
        { _id: order._id, walletDeduction: { $gt: 0 }, walletRefundedAt: null },
        { $set: { walletRefundedAt: new Date() } },
        { new: true }
      );
      if (claimedRefund) {
        const result = await refundWalletForFailedOrderPayment(
          userId,
          Number(order.walletDeduction),
          order._id,
          { description: `Wallet restored after cancelling order ${order.orderNumber || order._id}` }
        );
        if (result?.error) {
          await Order.updateOne({ _id: order._id }, { $set: { walletRefundedAt: null } });
        } else {
          order.walletRefundedAt = claimedRefund.walletRefundedAt || new Date();
        }
      }
    } catch (e) {
      console.warn('wallet restore on cancel failed (non-blocking):', e?.message);
    }
  }

  let refundAmount = 0;
  let refundMethod = check.policy.refundMethod || 'original_payment';
  let refundNotificationType = null;

  if (
    check.policy.autoRefundOnCancel &&
    order.paymentMethod?.methodType !== 'cash' &&
    order.paymentStatus === 'paid'
  ) {
    refundAmount = Math.max(0, Number(order.totalBill || 0) - (check.cancellationFee || 0));
    if (refundAmount > 0) {
      order.refundAmount = refundAmount;
      order.refundStatus = 'pending';
      refundNotificationType = 'REFUND_INITIATED';

      const walletPortion = Math.min(
        refundAmount,
        Math.max(0, Number(order.walletDeduction) || 0)
      );
      const isFullWalletPay = order.paymentMethod?.methodType === 'wallet';

      // Full wallet orders always refund to wallet. Partial wallet: restore wallet
      // portion immediately; remainder follows configured refund policy.
      if (isFullWalletPay || refundMethod === 'wallet') {
        await creditWallet(userId, refundAmount, String(order._id), `cancel-${order._id}`);
        order.refundStatus = 'processed';
        refundNotificationType = 'REFUND_COMPLETED';
        refundMethod = 'wallet';
      } else if (walletPortion > 0) {
        await creditWallet(
          userId,
          walletPortion,
          `cancel-wallet-${order._id}`,
          String(order._id)
        );
        const onlineRefund = roundMoney(refundAmount - walletPortion);
        if (onlineRefund > 0) {
          if (refundMethod === 'manual') {
            order.refundStatus = 'pending';
          } else {
            try {
              const refund = await createCancelRefundRequest(
                order,
                onlineRefund,
                'original_payment',
                reason
              );
              order.refundId = refund._id;
              order.refundStatus = refund.status || 'pending';
            } catch (e) {
              console.warn('createCancelRefundRequest failed (non-blocking):', e?.message);
            }
          }
        } else {
          order.refundStatus = 'processed';
          refundNotificationType = 'REFUND_COMPLETED';
          refundMethod = 'wallet';
        }
      } else if (refundMethod === 'manual') {
        order.refundStatus = 'pending';
      } else {
        // original_payment — create finance refund request for ops processing
        try {
          const refund = await createCancelRefundRequest(
            order,
            refundAmount,
            'original_payment',
            reason
          );
          order.refundId = refund._id;
          order.refundStatus = refund.status || 'pending';
        } catch (e) {
          console.warn('createCancelRefundRequest failed (non-blocking):', e?.message);
        }
      }
    }
  }

  await order.save();

  if (isUnreleasedGateway) {
    try {
      await restoreCartFromOrder(userId, order);
    } catch (e) {
      console.warn('restoreCartFromOrder on cancel failed (non-blocking):', e?.message);
    }
  }

  await sendOrderStatusNotification(order, 'cancelled', { actor: 'customer' });

  if (refundNotificationType) {
    try {
      await sendRefundNotification(String(order.userId), refundNotificationType, {
        amount: refundAmount,
        orderNumber: order.orderNumber,
        orderId: String(order._id),
        method: refundMethod === 'wallet' ? 'wallet' : 'original payment method',
      });
    } catch (e) {
      console.warn('refund notification failed (non-blocking):', e?.message);
    }
  }

  return order;
}

module.exports = { canCustomerCancel, executeCancellation, getActivePolicy };
