const RefundRequest = require('../../finance/models/RefundRequest');
const { Order } = require('../models/Order');
const { CustomerWallet } = require('../models/CustomerWallet');
const { WalletTransaction } = require('../models/WalletTransaction');

const AUTO_APPROVE_THRESHOLD = 500;

async function triggerAutoRefundForMissingItems(orderId, missingItems) {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const refundAmount = missingItems.reduce((sum, item) => sum + (item.refundAmount || item.price * item.quantity), 0);
    if (refundAmount <= 0) return null;

    const refund = await RefundRequest.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerId: order.userId,
      customerName: 'Customer',
      customerEmail: '',
      reasonCode: 'item_not_available',
      reasonText: `${missingItems.length} item(s) not available during picking`,
      amount: refundAmount,
      currency: 'INR',
      status: refundAmount <= AUTO_APPROVE_THRESHOLD ? 'approved' : 'pending',
      channel: 'auto_missing_item',
      refundMethod: 'wallet',
      missingItems: missingItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        refundAmount: item.refundAmount || item.price * item.quantity,
      })),
      timeline: [
        { status: 'pending', timestamp: new Date(), note: 'Auto-created from missing items during picking' },
        ...(refundAmount <= AUTO_APPROVE_THRESHOLD
          ? [{ status: 'approved', timestamp: new Date(), note: `Auto-approved (below ₹${AUTO_APPROVE_THRESHOLD} threshold)` }]
          : []),
      ],
    });

    await Order.findByIdAndUpdate(orderId, {
      refundId: refund._id,
      refundStatus: refund.status,
      refundAmount,
    });

    if (refund.status === 'approved') {
      await creditWallet(order.userId, refundAmount, refund._id.toString(), orderId.toString());
    }

    return refund;
  } catch (err) {
    console.error('autoRefundService error:', err);
    throw err;
  }
}

async function creditWallet(customerId, amount, refundId, orderId) {
  let wallet = await CustomerWallet.findOne({ customerId });
  if (!wallet) {
    wallet = await CustomerWallet.create({ customerId, balance: 0 });
  }

  const balanceBefore = wallet.balance;
  wallet.balance += amount;
  wallet.lastTransactionAt = new Date();
  await wallet.save();

  await WalletTransaction.create({
    walletId: wallet._id,
    customerId,
    type: 'credit',
    amount,
    balanceBefore,
    balanceAfter: wallet.balance,
    source: 'refund',
    referenceId: refundId,
    referenceType: 'refund',
    description: `Refund for order — missing items`,
  });

  return wallet;
}

module.exports = { triggerAutoRefundForMissingItems, creditWallet };
