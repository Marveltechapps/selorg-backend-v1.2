const mongoose = require('mongoose');
const { CustomerUser } = require('../../customer-backend/models/CustomerUser');
const AuditLog = require('../../common-models/AuditLog');
const websocketService = require('../../utils/websocket');
const logger = require('../../core/utils/logger');

async function auditAdminAction(req, action, entityId, details = {}) {
  try {
    await AuditLog.create({
      module: 'customer',
      action,
      entityType: 'CustomerUser',
      entityId: entityId ? String(entityId) : undefined,
      userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
      severity: action.includes('BLOCK') ? 'warning' : 'info',
      details,
      ipAddress: req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.get?.('user-agent'),
    });
  } catch (err) {
    logger.warn('AuditLog create failed', { err: err.message, action });
  }
}

const listCustomers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status && ['active', 'inactive', 'blocked'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { phoneNumber: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const allowedSorts = ['createdAt', 'lastLogin', 'loginCount', 'name', 'phoneNumber'];
    const sortField = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';

    const [customers, total] = await Promise.all([
      CustomerUser.find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CustomerUser.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        customers,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error listing customers', { error: error.message, stack: error.stack });
    next(error);
  }
};

const getCustomerStats = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [total, active, inactive, blocked, newToday, newThisWeek] = await Promise.all([
      CustomerUser.countDocuments(),
      CustomerUser.countDocuments({ status: 'active' }),
      CustomerUser.countDocuments({ status: 'inactive' }),
      CustomerUser.countDocuments({ status: 'blocked' }),
      CustomerUser.countDocuments({ createdAt: { $gte: todayStart } }),
      CustomerUser.countDocuments({ createdAt: { $gte: weekAgo } }),
    ]);

    res.json({
      success: true,
      data: { total, active, inactive, blocked, newToday, newThisWeek },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error fetching customer stats', { error: error.message });
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid customer ID' },
      });
    }

    const customer = await CustomerUser.findById(id).lean();
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }

    res.json({
      success: true,
      data: customer,
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error fetching customer', { error: error.message });
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid customer ID' },
      });
    }

    const customer = await CustomerUser.findById(id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }

    const { status } = req.body;

    if (status && ['active', 'inactive', 'blocked'].includes(status)) {
      const previousStatus = customer.status;
      customer.status = status;
      await customer.save();

      const actionName = status === 'blocked' ? 'CUSTOMER_BLOCKED' : status === 'active' ? 'CUSTOMER_UNBLOCKED' : 'CUSTOMER_STATUS_CHANGED';
      await auditAdminAction(req, actionName, id, {
        phoneNumber: customer.phoneNumber,
        previousStatus,
        newStatus: status,
      });

      try {
        websocketService.broadcastToRole('admin', 'customer:updated', {
          userId: String(customer._id),
          phoneNumber: customer.phoneNumber,
          status,
          timestamp: new Date().toISOString(),
        });
      } catch (wsErr) {
        logger.warn('WebSocket broadcast failed', { error: wsErr.message });
      }
    }

    const updated = await CustomerUser.findById(id).lean();
    res.json({
      success: true,
      data: updated,
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error updating customer', { error: error.message });
    next(error);
  }
};

const getCustomerOrders = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = req.query.status;

    const { Order } = require('../../customer-backend/models/Order');
    const filter = { userId: new mongoose.Types.ObjectId(id) };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { orders, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Error fetching customer orders', { error: error.message });
    next(error);
  }
};

const getCustomerRefunds = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const RefundRequest = require('../../finance/models/RefundRequest');
    const filter = { customerId: id };
    const status = req.query.status;
    if (status) filter.status = status;

    const [refunds, total] = await Promise.all([
      RefundRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      RefundRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { refunds, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Error fetching customer refunds', { error: error.message });
    next(error);
  }
};

const getCustomerTickets = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const { AdminSupportTicket } = require('../models/AdminSupportTicket');
    const filter = { customerId: id };

    const [tickets, total] = await Promise.all([
      AdminSupportTicket.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AdminSupportTicket.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { tickets, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Error fetching customer tickets', { error: error.message });
    next(error);
  }
};

const getCustomerRisk = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }

    const FraudAlert = require('../models/FraudAlert');
    const RiskProfile = require('../models/RiskProfile');
    const RefundRequest = require('../../finance/models/RefundRequest');
    const { Order } = require('../../customer-backend/models/Order');

    const [riskProfile, fraudAlerts, orderCount, refundCount, cancelledCount] = await Promise.all([
      RiskProfile.findOne({ entityId: id }).lean().catch(() => null),
      FraudAlert.find({ entityId: id, status: { $ne: 'resolved' } }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
      Order.countDocuments({ userId: new mongoose.Types.ObjectId(id) }),
      RefundRequest.countDocuments({ customerId: id }),
      Order.countDocuments({ userId: new mongoose.Types.ObjectId(id), status: 'cancelled' }),
    ]);

    const refundRate = orderCount > 0 ? (refundCount / orderCount * 100).toFixed(1) : 0;
    const cancellationRate = orderCount > 0 ? (cancelledCount / orderCount * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        riskProfile: riskProfile || { riskScore: 0, level: 'low' },
        fraudAlerts,
        metrics: {
          totalOrders: orderCount,
          totalRefunds: refundCount,
          totalCancellations: cancelledCount,
          refundRate: parseFloat(refundRate),
          cancellationRate: parseFloat(cancellationRate),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching customer risk', { error: error.message });
    next(error);
  }
};

const getCustomerWallet = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }

    const { CustomerWallet: WalletModel } = require('../../customer-backend/models/CustomerWallet');
    const { WalletTransaction } = require('../../customer-backend/models/WalletTransaction');

    const wallet = await WalletModel.findOne({ customerId: new mongoose.Types.ObjectId(id) }).lean();
    const recentTransactions = wallet
      ? await WalletTransaction.find({ walletId: wallet._id }).sort({ createdAt: -1 }).limit(10).lean()
      : [];

    res.json({
      success: true,
      data: {
        wallet: wallet || { balance: 0, pendingCredits: 0, currency: 'INR', isActive: false },
        recentTransactions,
      },
    });
  } catch (error) {
    logger.error('Error fetching customer wallet', { error: error.message });
    next(error);
  }
};

const creditCustomerWallet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive' } });
    }

    const { CustomerWallet: WalletModel } = require('../../customer-backend/models/CustomerWallet');
    const { WalletTransaction } = require('../../customer-backend/models/WalletTransaction');

    let wallet = await WalletModel.findOne({ customerId: new mongoose.Types.ObjectId(id) });
    if (!wallet) {
      wallet = await WalletModel.create({ customerId: new mongoose.Types.ObjectId(id), balance: 0 });
    }

    const balanceBefore = wallet.balance;
    wallet.balance += amount;
    wallet.lastTransactionAt = new Date();
    await wallet.save();

    await WalletTransaction.create({
      walletId: wallet._id,
      customerId: new mongoose.Types.ObjectId(id),
      type: 'credit',
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      source: 'goodwill',
      referenceId: req.user?.userId,
      referenceType: 'support_ticket',
      description: reason || 'Goodwill credit from support',
    });

    await auditAdminAction(req, 'WALLET_CREDIT', id, { amount, reason, newBalance: wallet.balance });

    res.json({
      success: true,
      data: { balance: wallet.balance, credited: amount },
    });
  } catch (error) {
    logger.error('Error crediting customer wallet', { error: error.message });
    next(error);
  }
};

const getCustomerAddresses = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }

    const { CustomerAddress } = require('../../customer-backend/models/CustomerAddress');
    const addresses = await CustomerAddress.find({ userId: new mongoose.Types.ObjectId(id) })
      .sort({ isDefault: -1, order: 1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: { addresses, total: addresses.length },
    });
  } catch (error) {
    logger.error('Error fetching customer addresses', { error: error.message });
    next(error);
  }
};

const getCustomerPaymentMethods = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }

    const { PaymentMethod } = require('../../customer-backend/models/PaymentMethod');
    const methods = await PaymentMethod.find({ userId: new mongoose.Types.ObjectId(id) })
      .sort({ isDefault: -1, createdAt: -1 })
      .select('-meta')
      .lean();

    res.json({
      success: true,
      data: { paymentMethods: methods, total: methods.length },
    });
  } catch (error) {
    logger.error('Error fetching customer payment methods', { error: error.message });
    next(error);
  }
};

const getPasswordInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }

    const customer = await CustomerUser.findById(id)
      .select('passwordHash autoGeneratedPassword isPasswordAutoGenerated passwordLastChangedAt passwordLastChangedBy')
      .lean();
    if (!customer) {
      return res.status(404).json({ success: false, error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' } });
    }

    res.json({
      success: true,
      data: {
        hasPassword: !!customer.passwordHash,
        isAutoGenerated: customer.isPasswordAutoGenerated || false,
        autoGeneratedPassword: customer.autoGeneratedPassword || null,
        passwordLastChangedAt: customer.passwordLastChangedAt || null,
        passwordLastChangedBy: customer.passwordLastChangedBy || null,
      },
    });
  } catch (error) {
    logger.error('Error fetching password info', { error: error.message });
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }

    const customer = await CustomerUser.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' } });
    }

    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let plainPassword = '';
    const randomBytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      plainPassword += chars[randomBytes[i] % chars.length];
    }

    const passwordHash = await bcrypt.hash(plainPassword, 10);
    customer.passwordHash = passwordHash;
    customer.autoGeneratedPassword = plainPassword;
    customer.isPasswordAutoGenerated = true;
    customer.passwordLastChangedAt = new Date();
    customer.passwordLastChangedBy = 'admin';
    await customer.save();

    await auditAdminAction(req, 'CUSTOMER_PASSWORD_RESET', id, {
      phoneNumber: customer.phoneNumber,
      resetBy: req.user?.userId,
    });

    res.json({
      success: true,
      data: {
        newPassword: plainPassword,
        message: 'Password has been reset',
      },
    });
  } catch (error) {
    logger.error('Error resetting customer password', { error: error.message });
    next(error);
  }
};

const setPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid customer ID' } });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters' } });
    }

    const customer = await CustomerUser.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' } });
    }

    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    customer.passwordHash = passwordHash;
    customer.autoGeneratedPassword = null;
    customer.isPasswordAutoGenerated = false;
    customer.passwordLastChangedAt = new Date();
    customer.passwordLastChangedBy = 'admin';
    await customer.save();

    await auditAdminAction(req, 'CUSTOMER_PASSWORD_SET', id, {
      phoneNumber: customer.phoneNumber,
      setBy: req.user?.userId,
    });

    res.json({
      success: true,
      data: { message: 'Password has been set' },
    });
  } catch (error) {
    logger.error('Error setting customer password', { error: error.message });
    next(error);
  }
};

module.exports = {
  listCustomers,
  getCustomerStats,
  getCustomerById,
  updateCustomer,
  getCustomerOrders,
  getCustomerRefunds,
  getCustomerTickets,
  getCustomerRisk,
  getCustomerWallet,
  creditCustomerWallet,
  getCustomerAddresses,
  getCustomerPaymentMethods,
  getPasswordInfo,
  resetPassword,
  setPassword,
};
