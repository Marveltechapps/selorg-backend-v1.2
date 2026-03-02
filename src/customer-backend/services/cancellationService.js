const { CancellationPolicy } = require('../models/CancellationPolicy');
const { Order } = require('../models/Order');
const { sendOrderStatusNotification } = require('./notificationService');
const { triggerAutoRefundForMissingItems, creditWallet } = require('./autoRefundService');

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

  return policy || {
    allowedStatuses: ['pending', 'confirmed'],
    freeWindowMinutes: 2,
    cancellationFeePercent: 0,
    maxCancellationFee: 0,
    maxCancellationsPerDay: 3,
    customerCanCancel: true,
    autoRefundOnCancel: true,
    refundMethod: 'original_payment',
  };
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

  await order.save();

  if (check.policy.autoRefundOnCancel && order.paymentMethod?.methodType !== 'cash') {
    const refundAmount = order.totalBill - (check.cancellationFee || 0);
    if (refundAmount > 0) {
      if (check.policy.refundMethod === 'wallet') {
        await creditWallet(userId, refundAmount, String(order._id), String(order._id));
      }
    }
  }

  await sendOrderStatusNotification(order, 'cancelled');

  return order;
}

module.exports = { canCustomerCancel, executeCancellation, getActivePolicy };
