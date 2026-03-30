const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { Order } = require('../models/Order');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const logger = require('../../core/utils/logger');

function isEnabled() {
  return process.env.WORLDLINE_ENABLED === '1' || process.env.WORLDLINE_ENABLED === 'true';
}

function getAmountLimits() {
  const min = parseFloat(process.env.WORLDLINE_MIN_AMOUNT_INR || '1');
  const max = parseFloat(process.env.WORLDLINE_MAX_AMOUNT_INR || '10');
  return { min, max };
}

function normalizePlatform(platform) {
  const p = String(platform || '').toLowerCase();
  if (p === 'android') return 'android';
  if (p === 'ios') return 'ios';
  return null;
}

function deviceIdForPlatform(platform, algo) {
  const a = String(algo || 'sh2').toLowerCase();
  const isSh1 = a === 'sh1' || a === 'sha256' || a === 'sha-256';
  if (platform === 'android') return isSh1 ? 'ANDROIDSH1' : 'ANDROIDSH2';
  if (platform === 'ios') return isSh1 ? 'iOSSH1' : 'iOSSH2';
  return null;
}

function hashForDeviceId(deviceId, value) {
  const did = String(deviceId || '');
  const algo = did.toUpperCase().endsWith('SH1') ? 'sha256' : 'sha512';
  return crypto.createHash(algo).update(String(value), 'utf8').digest('hex');
}

function computeToken({ merchantId, txnId, totalAmount, consumerId, consumerMobileNo, consumerEmailId, salt, deviceId }) {
  // Paynimo spec (most fields optional -> keep empty string placeholders)
  const parts = [
    merchantId,
    txnId,
    totalAmount,
    '', // accountNo
    consumerId,
    consumerMobileNo || '',
    consumerEmailId || '',
    '', // debitStartDate
    '', // debitEndDate
    '', // maxAmount
    '', // amountType
    '', // frequency
    '', // cardNumber
    '', // expMonth
    '', // expYear
    '', // cvvCode
    salt,
  ];
  return hashForDeviceId(deviceId, parts.join('|'));
}

function computeResponseHash({ msgOrder, response, salt, deviceId }) {
  const values = msgOrder.map((k) => (response?.[k] ?? ''));
  const toHash = `${values.join('|')}|${salt}`;
  return hashForDeviceId(deviceId, toHash);
}

function mapStatus(statusCodeOrTxnStatus) {
  const code = String(statusCodeOrTxnStatus || '').trim();
  if (code === '0300') return 'success';
  if (code === '0398') return 'pending';
  if (code === '0399') return 'failed';
  if (code === '0002') return 'cancelled';
  if (!code) return 'unknown';
  return 'failed';
}

function isTerminal(status) {
  return status === 'success' || status === 'failed' || status === 'cancelled';
}

async function createSession(userId, { orderId, platform, algo, consumerEmailId, consumerMobileNo }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };

  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) return { error: 'platform must be android or ios' };

  const deviceId = deviceIdForPlatform(normalizedPlatform, algo);
  if (!deviceId) return { error: 'Unable to determine deviceId for platform' };

  const merchantId = process.env.WORLDLINE_MERCHANT_ID;
  const schemeCode = process.env.WORLDLINE_SCHEME_CODE || 'FIRST';
  const salt = process.env.WORLDLINE_SALT;
  const returnUrl = process.env.WORLDLINE_RETURN_URL;

  if (!merchantId || !salt || !returnUrl) return { error: 'Worldline configuration incomplete' };

  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!order) return { error: 'Order not found' };

  const amount = Number(order.totalBill || 0);
  const { min, max } = getAmountLimits();
  if (!(amount >= min && amount <= max)) {
    return { error: `Amount must be between ₹${min} and ₹${max} in this environment` };
  }

  const txnId = `${Date.now()}-${uuidv4().slice(0, 8)}`;
  const consumerId = String(userId).slice(-20);

  const token = computeToken({
    merchantId,
    txnId,
    totalAmount: String(amount),
    consumerId,
    consumerMobileNo,
    consumerEmailId,
    salt,
    deviceId,
  });

  const idempotencyKey = `worldline:${orderId}:${normalizedPlatform}`;

  const sessionPayload = {
    features: {
      enableAbortResponse: true,
      enableExpressPay: true,
      enableInstrumentDeRegistration: true,
      enableMerTxnDetails: true,
    },
    consumerData: {
      deviceId,
      token,
      returnUrl,
      paymentMode: 'all',
      merchantId,
      currency: 'INR',
      consumerId,
      txnId,
      items: [{ itemId: schemeCode, amount: String(amount), comAmt: '0' }],
    },
  };

  const doc = await WorldlinePayment.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        userId: new mongoose.Types.ObjectId(userId),
        orderId: new mongoose.Types.ObjectId(orderId),
        idempotencyKey,
        merchantId,
        schemeCode,
        platform: normalizedPlatform,
        deviceId,
        txnId,
        amountInr: amount,
        token,
        status: 'created',
        rawSessionRequest: sessionPayload,
      },
    },
    { upsert: true, new: true }
  ).lean();

  logger.info('Worldline session created', { orderId: String(orderId), txnId: doc.txnId, platform: doc.platform });

  return { data: { paymentId: String(doc._id), orderId: String(orderId), txnId: doc.txnId, sessionPayload } };
}

async function completePayment(userId, { orderId, txnId, response }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };

  const salt = process.env.WORLDLINE_SALT;
  if (!salt) return { error: 'Worldline configuration incomplete' };

  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) });
  if (!order) return { error: 'Order not found' };

  const payment = await WorldlinePayment.findOne({ orderId: new mongoose.Types.ObjectId(orderId), txnId: String(txnId) });
  if (!payment) return { error: 'Payment session not found for order/txnId' };

  // Idempotency: if we already processed to a terminal status, return it as-is.
  if (isTerminal(payment.status) && payment.responseHash) {
    return {
      data: {
        orderId: String(orderId),
        txnId: String(txnId),
        status: payment.status,
        statusCode: payment.statusCode,
        statusMessage: payment.statusMessage,
        hashOk: true,
        tpslTxnId: payment.tpslTxnId,
        bankTxnId: payment.bankTxnId,
      },
    };
  }

  const msgOrder = [
    'txn_status',
    'txn_msg',
    'txn_err_msg',
    'clnt_txn_ref',
    'tpsl_bank_cd',
    'tpsl_txn_id',
    'txn_amt',
    'clnt_rqst_meta',
    'tpsl_txn_time',
    'bal_amt',
    'card_id',
    'alias_name',
    'BankTransactionID',
    'mandate_reg_no',
    'token',
  ];

  const expectedHash = computeResponseHash({ msgOrder, response, salt, deviceId: payment.deviceId });
  const receivedHash = String(response?.hash || response?.HASH || '').trim();
  const hashOk = receivedHash && expectedHash.toLowerCase() === receivedHash.toLowerCase();

  const statusCode = String(response?.txn_status || response?.statusCode || '').trim();
  const mapped = mapStatus(statusCode);
  const receivedAmount = Number(response?.txn_amt ?? response?.txnAmt ?? NaN);
  const amountOk = Number.isFinite(receivedAmount) ? receivedAmount === Number(payment.amountInr) : true;

  const update = {
    status: mapped,
    statusCode,
    statusMessage: String(response?.txn_msg || response?.txn_err_msg || ''),
    tpslTxnId: String(response?.tpsl_txn_id || ''),
    bankTxnId: String(response?.BankTransactionID || ''),
    tpslBankCd: String(response?.tpsl_bank_cd || ''),
    tpslTxnTime: String(response?.tpsl_txn_time || ''),
    responseHash: receivedHash,
    rawGatewayResponse: response || null,
  };

  if (!hashOk) {
    update.status = 'unknown';
    update.statusMessage = 'Hash verification failed';
  } else if (!amountOk) {
    update.status = 'unknown';
    update.statusMessage = 'Amount mismatch';
  }

  await WorldlinePayment.updateOne({ _id: payment._id }, { $set: update });

  if (hashOk && amountOk && mapped === 'success') {
    order.paymentStatus = 'paid';
    await order.save();
  } else if (mapped === 'failed' || mapped === 'cancelled') {
    order.paymentStatus = 'failed';
    await order.save();
  } else {
    order.paymentStatus = 'pending';
    await order.save();
  }

  return {
    data: {
      orderId: String(orderId),
      txnId: String(txnId),
      status: update.status,
      statusCode: update.statusCode,
      statusMessage: update.statusMessage,
      hashOk,
      tpslTxnId: update.tpslTxnId,
      bankTxnId: update.bankTxnId,
    },
  };
}

/**
 * Worldline can POST/GET to the merchant returnUrl after checkout.
 * This endpoint must not require customer auth (app may not be in control).
 */
async function processGatewayReturn({ response }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  const salt = process.env.WORLDLINE_SALT;
  if (!salt) return { error: 'Worldline configuration incomplete' };

  const txnId = String(
    response?.clnt_txn_ref ||
      response?.txnId ||
      response?.TXN_ID ||
      response?.clntTxnRef ||
      ''
  ).trim();
  if (!txnId) return { error: 'Missing clnt_txn_ref/txnId in gateway response' };

  const payment = await WorldlinePayment.findOne({ txnId });
  if (!payment) return { error: 'Payment session not found for txnId' };

  const order = await Order.findOne({ _id: payment.orderId });
  if (!order) return { error: 'Order not found for payment' };

  // Idempotency: if already terminal, don't mutate.
  if (isTerminal(payment.status) && payment.responseHash) {
    return {
      data: {
        orderId: String(order._id),
        txnId,
        status: payment.status,
        statusCode: payment.statusCode,
        statusMessage: payment.statusMessage,
        hashOk: true,
      },
    };
  }

  const msgOrder = [
    'txn_status',
    'txn_msg',
    'txn_err_msg',
    'clnt_txn_ref',
    'tpsl_bank_cd',
    'tpsl_txn_id',
    'txn_amt',
    'clnt_rqst_meta',
    'tpsl_txn_time',
    'bal_amt',
    'card_id',
    'alias_name',
    'BankTransactionID',
    'mandate_reg_no',
    'token',
  ];

  const expectedHash = computeResponseHash({ msgOrder, response, salt, deviceId: payment.deviceId });
  const receivedHash = String(response?.hash || response?.HASH || '').trim();
  const hashOk = receivedHash && expectedHash.toLowerCase() === receivedHash.toLowerCase();

  const statusCode = String(response?.txn_status || response?.statusCode || '').trim();
  const mapped = mapStatus(statusCode);
  const receivedAmount = Number(response?.txn_amt ?? response?.txnAmt ?? NaN);
  const amountOk = Number.isFinite(receivedAmount) ? receivedAmount === Number(payment.amountInr) : true;

  const update = {
    status: mapped,
    statusCode,
    statusMessage: String(response?.txn_msg || response?.txn_err_msg || ''),
    tpslTxnId: String(response?.tpsl_txn_id || ''),
    bankTxnId: String(response?.BankTransactionID || ''),
    tpslBankCd: String(response?.tpsl_bank_cd || ''),
    tpslTxnTime: String(response?.tpsl_txn_time || ''),
    responseHash: receivedHash,
    rawGatewayReturn: response || null,
  };

  if (!hashOk) {
    update.status = 'unknown';
    update.statusMessage = 'Hash verification failed';
  } else if (!amountOk) {
    update.status = 'unknown';
    update.statusMessage = 'Amount mismatch';
  }

  await WorldlinePayment.updateOne({ _id: payment._id }, { $set: update });

  if (hashOk && amountOk && mapped === 'success') {
    order.paymentStatus = 'paid';
    await order.save();
  } else if (mapped === 'failed' || mapped === 'cancelled') {
    order.paymentStatus = 'failed';
    await order.save();
  } else {
    order.paymentStatus = 'pending';
    await order.save();
  }

  logger.info('Worldline return processed', {
    orderId: String(order._id),
    txnId,
    status: update.status,
    statusCode: update.statusCode,
    hashOk,
    amountOk,
  });

  return {
    data: {
      orderId: String(order._id),
      txnId,
      status: update.status,
      statusCode: update.statusCode,
      statusMessage: update.statusMessage,
      hashOk,
      amountOk,
    },
  };
}

async function getStatus(userId, { orderId }) {
  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!order) return { error: 'Order not found' };
  const payment = await WorldlinePayment.findOne({ orderId: new mongoose.Types.ObjectId(orderId) }).sort({ createdAt: -1 }).lean();
  return {
    data: {
      orderId: String(orderId),
      orderPaymentStatus: order.paymentStatus,
      worldline: payment
        ? {
            txnId: payment.txnId,
            status: payment.status,
            statusCode: payment.statusCode,
            statusMessage: payment.statusMessage,
            updatedAt: payment.updatedAt,
          }
        : null,
    },
  };
}

module.exports = {
  createSession,
  completePayment,
  processGatewayReturn,
  getStatus,
  // exported for tests
  _internals: { computeToken, computeResponseHash, mapStatus, isTerminal },
};

