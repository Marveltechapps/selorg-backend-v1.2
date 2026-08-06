const { CustomerWallet } = require('../models/CustomerWallet');
const { WalletTransaction } = require('../models/WalletTransaction');
const { getOrCreateWallet, debitWalletForOrder } = require('../services/walletService');
const { createWalletTopUpSession } = require('../services/worldlinePaymentsService');

async function getBalance(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const wallet = await getOrCreateWallet(userId);
    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        pendingCredits: wallet.pendingCredits,
        currency: wallet.currency,
        isActive: wallet.isActive,
      },
    });
  } catch (err) {
    console.error('wallet getBalance error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getTransactions(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const wallet = await CustomerWallet.findOne({ customerId: userId });
    if (!wallet) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ walletId: wallet._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments({ walletId: wallet._id }),
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (err) {
    console.error('wallet getTransactions error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/**
 * Legacy direct debit endpoint. Prefer order create with paymentMethodType=wallet —
 * that path validates the order total server-side and is idempotent per order.
 */
async function debitForCheckout(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { amount, orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId is required. Wallet checkout must be done through order creation.',
      });
    }

    const { Order } = require('../models/Order');
    const order = await Order.findOne({
      _id: orderId,
      userId,
    }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Order is cancelled' });
    }

    const expected =
      Number(order.walletDeduction) > 0
        ? Number(order.walletDeduction)
        : Number(order.totalBill) || 0;
    const requested = Number(amount);
    if (Number.isFinite(requested) && Math.abs(requested - expected) > 0.009) {
      return res.status(400).json({
        success: false,
        message: 'Wallet amount must match the order wallet deduction computed by the server',
      });
    }

    const result = await debitWalletForOrder(userId, expected, order._id, {
      description: `Payment for order ${order.orderNumber || order._id}`,
    });
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.status(200).json({
      success: true,
      data: {
        balance: result.balance,
        deducted: result.deducted,
        alreadyDebited: !!result.alreadyDebited,
      },
    });
  } catch (err) {
    console.error('wallet debit error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/**
 * Direct free credit is disabled for customers.
 * Use POST /wallet/top-up/session → Paynimo → verified complete instead.
 * Manual credits remain available via admin APIs.
 */
async function creditForTopUp(req, res) {
  return res.status(403).json({
    success: false,
    message: 'Direct wallet credit is disabled. Please add money using payment.',
  });
}

/**
 * Start a Worldline/Paynimo checkout for wallet top-up.
 * Body: { amount, platform?, paymentMode?, consumerEmailId?, consumerMobileNo? }
 */
async function initiateTopUp(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const {
      amount,
      platform = 'web',
      algo,
      consumerEmailId,
      consumerMobileNo,
      paymentMode = 'all',
    } = req.body || {};

    const result = await createWalletTopUpSession(userId, {
      amount,
      platform,
      algo,
      consumerEmailId,
      consumerMobileNo,
      paymentMode,
    });

    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    console.error('wallet initiateTopUp error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  getBalance,
  getTransactions,
  debitForCheckout,
  creditForTopUp,
  initiateTopUp,
};
