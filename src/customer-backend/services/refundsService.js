const mongoose = require('mongoose');
const RefundRequest = require('../../finance/models/RefundRequest');
const { Order } = require('../models/Order');
const { CustomerUser } = require('../models/CustomerUser');
const logger = require('../../utils/logger');

const VALID_REASON_CODES = ['item_damaged', 'expired', 'late_delivery', 'wrong_item', 'customer_cancelled', 'other'];

function mapRefundForCustomer(r) {
  const refund = r.toObject ? r.toObject() : r;
  return {
    id: String(refund._id),
    orderId: refund.orderId,
    orderNumber: refund.orderNumber || `Order #${refund.orderId}`,
    date: refund.requestedAt ? new Date(refund.requestedAt).toISOString() : null,
    status: mapStatusForCustomer(refund.status),
    statusText: getStatusText(refund.status),
    amount: refund.amount,
    currency: refund.currency,
    reasonCode: refund.reasonCode,
    reasonText: refund.reasonText,
  };
}

function mapStatusForCustomer(status) {
  if (status === 'processed' || status === 'approved') return 'completed';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function getStatusText(status) {
  const map = {
    pending: 'Refund pending',
    approved: 'Refund approved',
    processed: 'Refund completed',
    rejected: 'Refund rejected',
    escalated: 'Refund under review',
  };
  return map[status] || 'Refund pending';
}

async function listRefunds(customerId, page = 1, pageSize = 20) {
  const query = { customerId: String(customerId) };
  const skip = (Math.max(1, page) - 1) * pageSize;
  const [refunds, total] = await Promise.all([
    RefundRequest.find(query).sort({ requestedAt: -1 }).skip(skip).limit(pageSize).lean(),
    RefundRequest.countDocuments(query),
  ]);
  return {
    refunds: refunds.map((r) => mapRefundForCustomer(r)),
    pagination: { page: Math.max(1, page), pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
  };
}

async function getRefundById(customerId, refundId) {
  const refund = await RefundRequest.findById(refundId).lean();
  if (!refund) return null;
  if (String(refund.customerId) !== String(customerId)) return null;
  return mapRefundForCustomer(refund);
}

async function getRefundDetailsForCustomer(customerId, refundId) {
  const refund = await RefundRequest.findById(refundId).lean();
  if (!refund) return null;
  if (String(refund.customerId) !== String(customerId)) return null;

  const orderQuery = { userId: new mongoose.Types.ObjectId(customerId) };
  if (mongoose.Types.ObjectId.isValid(refund.orderId) && String(mongoose.Types.ObjectId(refund.orderId)) === refund.orderId) {
    orderQuery._id = new mongoose.Types.ObjectId(refund.orderId);
  } else {
    orderQuery.$or = [{ orderNumber: refund.orderId }, { _id: refund.orderId }];
  }
  const order = await Order.findOne(orderQuery).lean();

  const items = (order?.items || []).map((it, idx) => ({
    id: String(it._id || idx + 1),
    name: it.productName || 'Item',
    weight: it.variantSize || '',
    discountedPrice: `₹${it.price ?? 0}`,
    originalPrice: it.originalPrice ? `₹${it.originalPrice}` : undefined,
    imageUrl: it.image,
  }));

  const requestedAt = refund.requestedAt ? new Date(refund.requestedAt) : new Date();
  const approvedAmount = ['processed', 'approved'].includes(refund.status) ? refund.amount : 0;

  return {
    id: String(refund._id),
    orderNumber: order?.orderNumber || refund.orderId || `Order #${refund.orderId}`,
    dateTime: requestedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    totalItems: `${items.length} item${items.length !== 1 ? 's' : ''}`,
    refundAmountRequested: `₹${refund.amount}`,
    refundAmountApproved: `₹${approvedAmount}`,
    status: mapStatusForCustomer(refund.status),
    products: items,
  };
}

async function createRefundRequest(customerId, body) {
  const { orderId, reasonCode, reasonText, amount, currency = 'INR' } = body;
  if (!orderId || !reasonCode || !reasonText) {
    throw new Error('orderId, reasonCode and reasonText are required');
  }
  if (!VALID_REASON_CODES.includes(reasonCode)) {
    throw new Error(`reasonCode must be one of: ${VALID_REASON_CODES.join(', ')}`);
  }

  const user = await CustomerUser.findById(customerId).lean();
  if (!user) throw new Error('Customer not found');

  const order = await Order.findOne({
    $or: [{ _id: orderId }, { orderNumber: orderId }],
    userId: customerId,
  }).lean();
  if (!order) throw new Error('Order not found');

  const refundAmount = typeof amount === 'number' && amount > 0
    ? amount
    : (order.totalBill ?? order.itemTotal ?? 0);
  if (refundAmount <= 0) throw new Error('Invalid refund amount');

  const existing = await RefundRequest.findOne({
    orderId: String(order._id),
    customerId: String(customerId),
    status: { $in: ['pending', 'approved', 'processed'] },
  });
  if (existing) throw new Error('Refund request already exists for this order');

  const refund = await RefundRequest.create({
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    customerId: String(customerId),
    customerName: user.name || user.email || 'Customer',
    customerEmail: user.email || '',
    reasonCode,
    reasonText,
    amount: refundAmount,
    currency: currency || 'INR',
    status: 'pending',
    channel: 'self_service',
  });

  return mapRefundForCustomer(refund);
}

module.exports = {
  listRefunds,
  getRefundById,
  getRefundDetailsForCustomer,
  createRefundRequest,
};
