const { CustomerWallet } = require('../models/CustomerWallet');
const { WalletTransaction } = require('../models/WalletTransaction');

async function getBalance(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    let wallet = await CustomerWallet.findOne({ customerId: userId });
    if (!wallet) {
      wallet = await CustomerWallet.create({ customerId: userId, balance: 0 });
    }
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
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('wallet getTransactions error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function debitForCheckout(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { amount, orderId } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const wallet = await CustomerWallet.findOne({ customerId: userId });
    if (!wallet || !wallet.isActive) {
      return res.status(400).json({ success: false, message: 'Wallet not available' });
    }
    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const balanceBefore = wallet.balance;
    wallet.balance -= amount;
    wallet.lastTransactionAt = new Date();
    await wallet.save();

    await WalletTransaction.create({
      walletId: wallet._id,
      customerId: userId,
      type: 'debit',
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      source: 'order_payment',
      referenceId: orderId,
      referenceType: 'order',
      description: `Payment for order`,
    });

    res.status(200).json({
      success: true,
      data: { balance: wallet.balance, deducted: amount },
    });
  } catch (err) {
    console.error('wallet debit error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getBalance, getTransactions, debitForCheckout };
