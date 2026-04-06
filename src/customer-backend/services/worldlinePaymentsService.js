const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { Order } = require('../models/Order');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const logger = require('../../core/utils/logger');
const fs = require('fs');

// #region agent log
const DEBUG_SESSION = '636da9';
const DEBUG_LOG_PATH =
  process.env.DEBUG_WORLDLINE_LOG_PATH ||
  '/Users/muthuramanveerashekar/Desktop/Dev/selorg-combined/.cursor/debug-636da9.log';

function appendPaynimoDebugLog(payload) {
  const line =
    JSON.stringify({
      sessionId: DEBUG_SESSION,
      timestamp: Date.now(),
      ...payload,
    }) + '\n';
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (_) {
    /* log path missing on remote hosts — same payload goes to logger below */
  }
}
// #endregion

function isEnabled() {
  const raw = String(process.env.WORLDLINE_ENABLED || '').trim().toLowerCase();
  // Be tolerant across deployment platforms that store booleans differently.
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Worldline sandbox kits typically allow only ₹1–₹10 per txn. Production: set WORLDLINE_MAX_AMOUNT_INR to your live limit. */
const DEFAULT_MIN_AMOUNT_INR = 1;
const DEFAULT_MAX_AMOUNT_INR = 10;

function getAmountLimits() {
  const parsedMin = parseFloat(process.env.WORLDLINE_MIN_AMOUNT_INR ?? '');
  const parsedMax = parseFloat(process.env.WORLDLINE_MAX_AMOUNT_INR ?? '');
  const min = Number.isFinite(parsedMin) ? parsedMin : DEFAULT_MIN_AMOUNT_INR;
  let max = Number.isFinite(parsedMax) ? parsedMax : DEFAULT_MAX_AMOUNT_INR;
  if (max < min) max = min;
  return { min: Math.max(0, min), max };
}

function worldlineAmountRangeError(amount, min, max) {
  const rounded = Math.round(amount * 100) / 100;
  if (amount > max) {
    return (
      `Worldline in this environment only accepts ₹${min}–₹${max} per payment. ` +
      `Your order total is ₹${rounded} (items + delivery + handling + tip − discounts), not just cart subtotal. ` +
      `Use Cash on Delivery for larger tests, or keep the full order within ₹${max}. ` +
      `In production, set WORLDLINE_MAX_AMOUNT_INR to match your live merchant limit.`
    );
  }
  if (amount < min) {
    return `Order total ₹${rounded} is below the minimum ₹${min} for online payment in this environment.`;
  }
  return `Amount must be between ₹${min} and ₹${max} in this environment`;
}

function normalizePlatform(platform) {
  const p = String(platform || '').toLowerCase();
  if (p === 'android') return 'android';
  if (p === 'ios') return 'ios';
  return null;
}

function trimEnv(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Paynimo uses totalamount in the token string; amount must match item line(s) (typically two decimals, e.g. 7.00). */
function formatWorldlineTxnAmount(amountInr) {
  const n = Number(amountInr);
  if (!Number.isFinite(n) || n < 0) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}

function parseAlgoToken(raw) {
  const a = String(raw || '')
    .trim()
    .toLowerCase();
  if (a === 'sh1' || a === 'sha256' || a === 'sha-256') return 'sh1';
  if (a === 'sh2' || a === 'sha512' || a === 'sha-512') return 'sh2';
  return null;
}

/**
 * Prefer WORLDLINE_HASH_ALGO on the server so PROD TEST vs live kits can be fixed without an app release.
 * Optional client `algo` only applies when env is unset. Default sh2 matches Paynimo Android sample (SHA-512 / AndroidSH2).
 */
function resolveWorldlineHashAlgo(requestAlgo) {
  const fromEnv = parseAlgoToken(process.env.WORLDLINE_HASH_ALGO);
  if (fromEnv) return fromEnv;
  const fromClient = parseAlgoToken(requestAlgo);
  if (fromClient) return fromClient;
  return 'sh2';
}

function deviceIdForPlatform(platform, algo) {
  const resolved = resolveWorldlineHashAlgo(algo);
  const isSh1 = resolved === 'sh1';
  // Paynimo Android SDK native code samples use "AndroidSH1"/"AndroidSH2" (mixed case).
  // Documentation shows "ANDROIDSH1" but actual SDK code uses "AndroidSH1" (capital A, lowercase ndroid, capital SH).
  if (platform === 'android') return isSh1 ? 'AndroidSH1' : 'AndroidSH2';
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

function verifyGatewayResponse({ payment, response, salt }) {
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

  const receivedAmount = Number(response?.txn_amt ?? response?.txnAmt ?? NaN);
  const amountOk = Number.isFinite(receivedAmount) ? receivedAmount === Number(payment.amountInr) : true;

  let verificationError = 'none';
  if (!hashOk) verificationError = 'hash_mismatch';
  else if (!amountOk) verificationError = 'amount_mismatch';

  return {
    hashOk,
    amountOk,
    verificationError,
    receivedHash,
    statusCode: String(response?.txn_status || response?.statusCode || '').trim(),
    statusMessage: String(response?.txn_msg || response?.txn_err_msg || ''),
  };
}

async function createSession(userId, { orderId, platform, algo, consumerEmailId, consumerMobileNo, paymentMode }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };

  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) return { error: 'platform must be android or ios' };

  const deviceId = deviceIdForPlatform(normalizedPlatform, algo);
  if (!deviceId) return { error: 'Unable to determine deviceId for platform' };

  const merchantId = trimEnv(process.env.WORLDLINE_MERCHANT_ID);
  const schemeCode = trimEnv(process.env.WORLDLINE_SCHEME_CODE) || 'FIRST';
  const salt = trimEnv(process.env.WORLDLINE_SALT);
  const returnUrl = trimEnv(process.env.WORLDLINE_RETURN_URL);

  if (!merchantId || !salt || !returnUrl) return { error: 'Worldline configuration incomplete' };

  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!order) return { error: 'Order not found' };

  const amount = Number(order.totalBill || 0);
  const amountStr = formatWorldlineTxnAmount(amount);
  const { min, max } = getAmountLimits();
  if (!(amount >= min && amount <= max)) {
    return { error: worldlineAmountRangeError(amount, min, max) };
  }

  // Find latest attempt for this order + platform
  const latestAttempt = await WorldlinePayment.findOne({ orderId, platform: normalizedPlatform }).sort({ attemptNo: -1 });

  let attemptNo = 1;
  let txnId;
  let shouldCreateNew = true;

  if (latestAttempt) {
    const isExpired = latestAttempt.sessionExpiresAt && new Date() > latestAttempt.sessionExpiresAt;
    if (!isTerminal(latestAttempt.status) && !isExpired) {
      // Reuse active session
      txnId = latestAttempt.txnId;
      attemptNo = latestAttempt.attemptNo;
      shouldCreateNew = false;
    } else {
      // Create new attempt
      attemptNo = latestAttempt.attemptNo + 1;
    }
  }

  if (shouldCreateNew) {
    txnId = `${Date.now()}-${uuidv4().slice(0, 8)}-${attemptNo}`;
  }

  const consumerId = String(userId).slice(-20);
  const mobileForHash = trimEnv(consumerMobileNo);
  const emailForHash = trimEnv(consumerEmailId);

  const token = computeToken({
    merchantId,
    txnId,
    totalAmount: amountStr,
    consumerId,
    consumerMobileNo: mobileForHash,
    consumerEmailId: emailForHash,
    salt,
    deviceId,
  });

  // #region agent log
  const resolvedAlgo = resolveWorldlineHashAlgo(algo);
  const preSaltParts = [
    merchantId,
    txnId,
    amountStr,
    '',
    consumerId,
    mobileForHash,
    emailForHash,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  const preSaltJoin = preSaltParts.join('|');
  const paynimoDebugData = {
    resolvedAlgo,
    algoEnvRaw: process.env.WORLDLINE_HASH_ALGO != null ? String(process.env.WORLDLINE_HASH_ALGO).trim() : null,
    algoSource: trimEnv(process.env.WORLDLINE_HASH_ALGO)
      ? 'env'
      : parseAlgoToken(algo)
        ? 'client'
        : 'default_sh2',
    deviceId,
    platform: normalizedPlatform,
    amountStr,
    merchantIdLen: merchantId.length,
    saltLen: salt.length,
    schemeCode,
    txnId,
    consumerIdLen: String(consumerId).length,
    consumerMobileLen: mobileForHash.length,
    consumerEmailLen: emailForHash.length,
    tokenLen: token.length,
    hashFn: deviceId.toUpperCase().endsWith('SH1') ? 'sha256' : 'sha512',
    preSaltPipeSha256_16: crypto.createHash('sha256').update(preSaltJoin, 'utf8').digest('hex').slice(0, 16),
    item0Amount: amountStr,
    shouldCreateNew,
  };
  appendPaynimoDebugLog({
    hypothesisId: 'H1-H5',
    location: 'worldlinePaymentsService.createSession',
    message: 'paynimo request token inputs',
    data: paynimoDebugData,
  });
  logger.info('Worldline Paynimo hash diagnostics', paynimoDebugData);
  // #endregion

  const idempotencyKey = `worldline:${orderId}:${normalizedPlatform}:${attemptNo}`;

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
      paymentMode: paymentMode || 'all',
      merchantId,
      currency: 'INR',
      consumerId,
      consumerMobileNo: mobileForHash,
      consumerEmailId: emailForHash,
      txnId,
      // Paynimo / Weipl sample: totalAmount must match token segment 3 and sum of items[].amount (two decimals).
      totalAmount: amountStr,
      items: [{ itemId: schemeCode, amount: amountStr, comAmt: '0.00' }],
      customStyle: {
        PRIMARY_COLOR_CODE: '#034703',
        SECONDARY_COLOR_CODE: '#FFFFFF',
        BUTTON_COLOR_CODE_1: '#034703',
        BUTTON_COLOR_CODE_2: '#FFFFFF',
      },
    },
  };

  const sessionDurationMs = 30 * 60 * 1000; // 30 minutes
  const sessionExpiresAt = new Date(Date.now() + sessionDurationMs);

  const doc = await WorldlinePayment.findOneAndUpdate(
    { orderId, attemptNo },
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
        attemptNo,
        amountInr: amount,
        token,
        status: 'created',
        sessionExpiresAt,
        rawSessionRequest: sessionPayload,
      },
    },
    { upsert: true, new: true }
  ).lean();

  logger.info('Worldline session managed', {
    orderId: String(orderId),
    txnId: doc.txnId,
    attemptNo: doc.attemptNo,
    isNew: shouldCreateNew,
  });

  return { data: { paymentId: String(doc._id), orderId: String(orderId), txnId: doc.txnId, attemptNo: doc.attemptNo, sessionPayload } };
}

async function completePayment(userId, { orderId, txnId, response }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };

  const salt = trimEnv(process.env.WORLDLINE_SALT);
  if (!salt) return { error: 'Worldline configuration incomplete' };

  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) });
  if (!order) return { error: 'Order not found' };

  const payment = await WorldlinePayment.findOne({ orderId: new mongoose.Types.ObjectId(orderId), txnId: String(txnId) });
  if (!payment) return { error: 'Payment session not found for order/txnId' };

  // Idempotency: if already processed to a terminal status, return it as-is.
  if (isTerminal(payment.status) && payment.responseHash) {
    return {
      data: {
        orderId: String(orderId),
        txnId: String(txnId),
        status: payment.status,
        statusCode: payment.statusCode,
        statusMessage: payment.statusMessage,
        hashOk: payment.verificationError === 'none',
        tpslTxnId: payment.tpslTxnId,
        bankTxnId: payment.bankTxnId,
      },
    };
  }

  const { hashOk, amountOk, verificationError, receivedHash, statusCode, statusMessage } = verifyGatewayResponse({
    payment,
    response,
    salt,
  });

  const mapped = mapStatus(statusCode);

  const update = {
    status: mapped,
    statusCode,
    statusMessage,
    verificationSource: 'app_complete',
    verificationError,
    tpslTxnId: String(response?.tpsl_txn_id || ''),
    bankTxnId: String(response?.BankTransactionID || ''),
    tpslBankCd: String(response?.tpsl_bank_cd || ''),
    tpslTxnTime: String(response?.tpsl_txn_time || ''),
    responseHash: receivedHash,
    rawGatewayResponse: response || null,
  };

  if (!hashOk || !amountOk) {
    update.status = 'unknown';
    update.statusMessage = !hashOk ? 'Hash verification failed' : 'Amount mismatch';
  }

  // Use findOneAndUpdate with terminal guard to prevent races
  const finalPayment = await WorldlinePayment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: ['success', 'failed', 'cancelled'] } },
    { $set: update },
    { new: true }
  ).lean();

  const effectivePayment = finalPayment || (await WorldlinePayment.findById(payment._id).lean());

  if (effectivePayment.status === 'success' && effectivePayment.verificationError === 'none') {
    order.paymentStatus = 'paid';
    await order.save();
  } else if (effectivePayment.status === 'failed' || effectivePayment.status === 'cancelled') {
    // Only move to failed if verified, or if we decide to trust cancelled even if unverified (risky)
    if (effectivePayment.verificationError === 'none') {
      order.paymentStatus = 'failed';
      await order.save();
    }
  }

  return {
    data: {
      orderId: String(orderId),
      txnId: String(txnId),
      status: effectivePayment.status,
      statusCode: effectivePayment.statusCode,
      statusMessage: effectivePayment.statusMessage,
      hashOk: effectivePayment.verificationError === 'none',
      tpslTxnId: effectivePayment.tpslTxnId,
      bankTxnId: effectivePayment.bankTxnId,
    },
  };
}

/**
 * Worldline can POST/GET to the merchant returnUrl after checkout.
 * This endpoint must not require customer auth (app may not be in control).
 */
async function processGatewayReturn({ response }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  const salt = trimEnv(process.env.WORLDLINE_SALT);
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
        hashOk: payment.verificationError === 'none',
      },
    };
  }

  const { hashOk, amountOk, verificationError, receivedHash, statusCode, statusMessage } = verifyGatewayResponse({
    payment,
    response,
    salt,
  });

  const mapped = mapStatus(statusCode);

  const update = {
    status: mapped,
    statusCode,
    statusMessage,
    verificationSource: 'gateway_return',
    verificationError,
    tpslTxnId: String(response?.tpsl_txn_id || ''),
    bankTxnId: String(response?.BankTransactionID || ''),
    tpslBankCd: String(response?.tpsl_bank_cd || ''),
    tpslTxnTime: String(response?.tpsl_txn_time || ''),
    responseHash: receivedHash,
    rawGatewayReturn: response || null,
  };

  if (!hashOk || !amountOk) {
    update.status = 'unknown';
    update.statusMessage = !hashOk ? 'Hash verification failed' : 'Amount mismatch';
  }

  const finalPayment = await WorldlinePayment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: ['success', 'failed', 'cancelled'] } },
    { $set: update },
    { new: true }
  ).lean();

  const effectivePayment = finalPayment || (await WorldlinePayment.findById(payment._id).lean());

  if (effectivePayment.status === 'success' && effectivePayment.verificationError === 'none') {
    order.paymentStatus = 'paid';
    await order.save();
  } else if (effectivePayment.status === 'failed' || effectivePayment.status === 'cancelled') {
    if (effectivePayment.verificationError === 'none') {
      order.paymentStatus = 'failed';
      await order.save();
    }
  }

  logger.info('Worldline return processed', {
    orderId: String(order._id),
    txnId,
    status: effectivePayment.status,
    statusCode: effectivePayment.statusCode,
    verificationError: effectivePayment.verificationError,
    attemptNo: effectivePayment.attemptNo,
    tpslTxnId: effectivePayment.tpslTxnId,
  });

  return {
    data: {
      orderId: String(order._id),
      txnId,
      status: effectivePayment.status,
      statusCode: effectivePayment.statusCode,
      statusMessage: effectivePayment.statusMessage,
      hashOk: effectivePayment.verificationError === 'none',
      amountOk,
    },
  };
}

async function getStatus(userId, { orderId }) {
  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!order) return { error: 'Order not found' };

  const payments = await WorldlinePayment.find({ orderId: new mongoose.Types.ObjectId(orderId) }).sort({ attemptNo: -1 });
  const payment = payments[0]; // Latest attempt

  let uiState = 'WAITING_FOR_PAYMENT';
  let recommendedAction = 'NONE';

  if (!payment) {
    uiState = 'WAITING_FOR_PAYMENT';
    recommendedAction = 'CREATE_SESSION';
  } else {
    const isExpired = payment.sessionExpiresAt && new Date() > payment.sessionExpiresAt;

    if (payment.status === 'success' && payment.verificationError === 'none') {
      uiState = 'PAID';
      recommendedAction = 'GO_TO_ORDER';
    } else if (payment.status === 'pending') {
      uiState = 'PENDING_VERIFICATION';
      recommendedAction = 'POLL_STATUS';
    } else if (payment.status === 'unknown') {
      uiState = 'UNKNOWN';
      recommendedAction = 'CONTACT_SUPPORT';
    } else if (isTerminal(payment.status) || isExpired) {
      uiState = 'RETRY_AVAILABLE';
      recommendedAction = 'RETRY_PAYMENT';
    } else if (payment.status === 'created' || payment.status === 'initiated') {
      uiState = 'WAITING_FOR_PAYMENT';
      recommendedAction = 'OPEN_GATEWAY';
    }
  }

  return {
    data: {
      orderId: String(orderId),
      orderPaymentStatus: order.paymentStatus,
      uiState,
      recommendedAction,
      latestPayment: payment
        ? {
            txnId: payment.txnId,
            attemptNo: payment.attemptNo,
            status: payment.status,
            statusCode: payment.statusCode,
            statusMessage: payment.statusMessage,
            verificationError: payment.verificationError,
            isExpired: payment.sessionExpiresAt && new Date() > payment.sessionExpiresAt,
            updatedAt: payment.updatedAt,
          }
        : null,
      allAttempts: payments.map((p) => ({
        txnId: p.txnId,
        attemptNo: p.attemptNo,
        status: p.status,
        createdAt: p.createdAt,
      })),
    },
  };
}

module.exports = {
  createSession,
  completePayment,
  processGatewayReturn,
  getStatus,
  // exported for tests
  _internals: {
    computeToken,
    computeResponseHash,
    mapStatus,
    isTerminal,
    formatWorldlineTxnAmount,
    resolveWorldlineHashAlgo,
    deviceIdForPlatform,
  },
};

