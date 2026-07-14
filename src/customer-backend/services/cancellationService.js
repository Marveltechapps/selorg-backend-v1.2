const RefundRequest = require('../../finance/models/RefundRequest');
const { CancellationPolicy } = require('../models/CancellationPolicy');
const { Order } = require('../models/Order');
const { CustomerUser } = require('../models/CustomerUser');
const { sendOrderStatusNotification } = require('./notificationService');
const { creditWallet } = require('./autoRefundService');
const { restoreCartFromOrder } = require('./cartService');

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

  let refundAmount = 0;
  let refundMethod = check.policy.refundMethod || 'original_payment';

  if (
    check.policy.autoRefundOnCancel &&
    order.paymentMethod?.methodType !== 'cash' &&
    order.paymentStatus === 'paid'
  ) {
    refundAmount = Math.max(0, Number(order.totalBill || 0) - (check.cancellationFee || 0));
    if (refundAmount > 0) {
      order.refundAmount = refundAmount;
      order.refundStatus = 'pending';

      if (refundMethod === 'wallet') {
        await creditWallet(userId, refundAmount, String(order._id), String(order._id));
        order.refundStatus = 'processed';
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

  await sendOrderStatusNotification(order, 'cancelled');

  return order;
}

module.exports = { canCustomerCancel, executeCancellation, getActivePolicy };
