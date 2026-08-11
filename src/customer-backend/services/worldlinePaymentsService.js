const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { Order } = require('../models/Order');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const { releaseOrderFulfillment, voidUnpaidOnlineOrder } = require('./orderService');
const { creditWallet, MAX_TOP_UP_AMOUNT } = require('./walletService');
const logger = require('../../core/utils/logger');
const {
  resolveWebAppBaseUrl,
  resolveReturnUrlForPlatform,
  sanitizeCheckoutOrigin,
  resolveWorldlineApiReturnUrl,
  isLocalOrPrivateHost,
} = require('../utils/paymentRedirectUrls');
const { inferInstrumentFieldsFromWorldline } = require('../utils/paymentMethodDisplay');
const fs = require('fs');

function applyWorldlineInstrumentToOrder(order, worldlinePayment) {
  if (!order || !worldlinePayment) return;
  try {
    const fields = inferInstrumentFieldsFromWorldline(worldlinePayment);
    if (!order.paymentMethod) order.paymentMethod = {};
    if (fields.instrument) order.paymentMethod.instrument = fields.instrument;
    if (fields.displayLabel) order.paymentMethod.displayLabel = fields.displayLabel;
    if (fields.paymentMode) order.paymentMethod.paymentMode = fields.paymentMode;
  } catch (e) {
    logger.warn('applyWorldlineInstrumentToOrder failed', { error: e?.message });
  }
}

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
  if (p === 'web') return 'web';
  return null;
}

function trimEnv(value) {
  if (value == null) return '';
  return String(value).trim();
}

let worldlineMerchantEnvMismatchLogged = false;
function warnWorldlineMerchantEnvMismatchOnce() {
  if (worldlineMerchantEnvMismatchLogged) return;
  const id = trimEnv(process.env.WORLDLINE_MERCHANT_ID);
  const code = trimEnv(process.env.WORLDLINE_MERCHANT_CODE);
  if (id && code && id !== code) {
    worldlineMerchantEnvMismatchLogged = true;
    logger.error(
      `WORLDLINE merchant env mismatch: WORLDLINE_MERCHANT_ID=${id} vs WORLDLINE_MERCHANT_CODE=${code}. ` +
        'Token/session use WORLDLINE_MERCHANT_ID when set (see createSession). Align both to the same live/test id.'
    );
  }
}

/** Stable synthetic ObjectId for standalone payments (no `customer_orders` row). Scoped per user + client ref. */
function syntheticOrderObjectIdForExternalRef(externalOrderRef, userId) {
  const twelve = crypto
    .createHash('sha256')
    .update(`selorg-payment:${String(externalOrderRef)}:${String(userId)}`, 'utf8')
    .digest()
    .subarray(0, 12);
  return new mongoose.Types.ObjectId(twelve);
}

function standaloneInitiateEnabled() {
  const raw = String(process.env.PAYMENT_STANDALONE_INITIATE || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  return process.env.NODE_ENV !== 'production';
}

function canonicalizePaynimoPaymentMode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'all';
  const lower = raw.toLowerCase();
  if (lower === 'upi') return 'UPI';
  if (lower === 'netbanking' || lower === 'nb') return 'netBanking';
  if (lower === 'card' || lower === 'cards') return 'cards';
  if (lower === 'wallet' || lower === 'wallets') return 'wallets';
  if (lower === 'all') return 'all';
  return raw;
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
 * Optional client `algo` only applies when env is unset. Default `sh2` → SHA-512 (see `hashForDeviceId`: SH1→sha256, SH2→sha512).
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
  if (platform === 'web') return isSh1 ? 'WEBSH1' : 'WEBSH2';
  // Paynimo Android SDK native code samples use "AndroidSH1"/"AndroidSH2" (mixed case).
  // Documentation shows "ANDROIDSH1" but actual SDK code uses "AndroidSH1" (capital A, lowercase ndroid, capital SH).
  if (platform === 'android') return isSh1 ? 'AndroidSH1' : 'AndroidSH2';
  if (platform === 'ios') return isSh1 ? 'iOSSH1' : 'iOSSH2';
  return null;
}

/** Paynimo: *SH1 suffix → SHA-256, *SH2 → SHA-512 (matches Worldline AndroidSH1/AndroidSH2 kits). */
function hashForDeviceId(deviceId, value) {
  const did = String(deviceId || '').toUpperCase();
  const algo = did.endsWith('SH1') ? 'sha256' : 'sha512';
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
  // Must be 17 segments (16 fields + salt); Paynimo rebuilds the same pipe string for request validation.
  if (parts.length !== 17) {
    logger.warn('Worldline Paynimo token pipe segment count mismatch', { pipeCount: parts.length, expect: 17 });
  }
  return hashForDeviceId(deviceId, parts.join('|'));
}

function computeResponseHash({ msgOrder, response, salt, deviceId }) {
  const values = msgOrder.map((k) => (response?.[k] ?? ''));
  const toHash = `${values.join('|')}|${salt}`;
  return hashForDeviceId(deviceId, toHash);
}

function safeJsonParse(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Set true when `normalizeWorldlineGatewayPayload` merged a pipe-delimited `msg` (for logging only). */
let lastWorldlineMsgPipeParsed = false;

/** Paynimo SDK `msg` pipe order (16 segments ending with response `hash`). */
const WORLDLINE_PAYNIMO_MSG_PIPE_ORDER = [
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
  'hash',
];

/**
 * Parse Paynimo pipe-delimited `msg` (not JSON — does not start with '{').
 * When `clnt_rqst_meta` contains '|', tail fields are taken from the last8 segments.
 */
function parsePipeMsg(msgStr) {
  if (!msgStr || typeof msgStr !== 'string') return null;
  if (msgStr.trimStart().startsWith('{')) return null;
  const parts = msgStr.split('|');
  const need = WORLDLINE_PAYNIMO_MSG_PIPE_ORDER.length;
  if (parts.length < need) return null;

  let parsed;
  if (parts.length === need) {
    parsed = {};
    WORLDLINE_PAYNIMO_MSG_PIPE_ORDER.forEach((key, i) => {
      parsed[key] = parts[i] ?? '';
    });
  } else {
    const N = parts.length;
    const metaEnd = N - (need - 8);
    parsed = {
      txn_status: parts[0] ?? '',
      txn_msg: parts[1] ?? '',
      txn_err_msg: parts[2] ?? '',
      clnt_txn_ref: parts[3] ?? '',
      tpsl_bank_cd: parts[4] ?? '',
      tpsl_txn_id: parts[5] ?? '',
      txn_amt: parts[6] ?? '',
      clnt_rqst_meta: parts.slice(7, metaEnd).join('|'),
      tpsl_txn_time: parts[N - 8] ?? '',
      bal_amt: parts[N - 7] ?? '',
      card_id: parts[N - 6] ?? '',
      alias_name: parts[N - 5] ?? '',
      BankTransactionID: parts[N - 4] ?? '',
      mandate_reg_no: parts[N - 3] ?? '',
      token: parts[N - 2] ?? '',
      hash: parts[N - 1] ?? '',
    };
  }

  const hashStr = String(parsed.hash || '');
  logger.info('Worldline parsePipeMsg', {
    pipeParsed: true,
    partCount: parts.length,
    parsedTxnStatus: parsed.txn_status,
    parsedTpslTxnId: parsed.tpsl_txn_id,
    parsedHashPrefix: hashStr ? hashStr.slice(0, 16) : '',
  });

  return parsed;
}

/**
 * Worldline / Paynimo POST bodies and RN SDK success callbacks vary:
 * - Pipe-delimited `msg` (most common from RN SDK): merchant_code + msg string
 * - JSON inside msg (legacy / some gateways)
 * - Mixed camelCase vs snake_case
 */
function normalizeWorldlineGatewayPayload(raw) {
  lastWorldlineMsgPipeParsed = false;
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};

  let merged = { ...raw };
  const mergeObj = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    merged = { ...merged, ...obj };
  };

  for (const nestKey of ['paymentResponse', 'payment_response', 'data', 'body', 'result', 'gatewayResponse']) {
    if (merged[nestKey] && typeof merged[nestKey] === 'object' && !Array.isArray(merged[nestKey])) {
      mergeObj(merged[nestKey]);
    }
  }

  const MSG_KEYS = ['msg', 'message', 'MSG', 'responseMsg', 'respMsg'];
  for (const msgKey of MSG_KEYS) {
    if (merged[msgKey] && typeof merged[msgKey] === 'string') {
      const pipeParsed = parsePipeMsg(merged[msgKey]);
      if (pipeParsed) {
        merged = { ...merged, ...pipeParsed };
        lastWorldlineMsgPipeParsed = true;
        break;
      }
    }
  }

  for (let round = 0; round < 8; round++) {
    const before = JSON.stringify(merged);
    for (const msgKey of MSG_KEYS) {
      const val = merged[msgKey];
      if (val && typeof val === 'string' && val.trimStart().startsWith('{')) {
        const parsed = safeJsonParse(val);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          merged = { ...merged, ...parsed };
        }
      }
    }
    if (JSON.stringify(merged) === before) break;
  }

  const pick = (...candidates) => {
    for (const c of candidates) {
      if (c == null) continue;
      const s = String(c).trim();
      if (s !== '') return s;
    }
    return '';
  };

  return {
    ...merged,
    txn_status: pick(merged.txn_status, merged.txnStatus, merged.TXN_STATUS, merged.status, merged.statusCode),
    txn_msg: pick(merged.txn_msg, merged.txnMsg, merged.TXN_MSG),
    txn_err_msg: pick(merged.txn_err_msg, merged.txnErrMsg, merged.TXN_ERR_MSG),
    clnt_txn_ref: pick(merged.clnt_txn_ref, merged.clntTxnRef, merged.CLNT_TXN_REF, merged.txnId, merged.TXN_ID),
    tpsl_bank_cd: pick(merged.tpsl_bank_cd, merged.tpslBankCd, merged.TPSL_BANK_CD),
    tpsl_txn_id: pick(merged.tpsl_txn_id, merged.tpslTxnId, merged.TPSL_TXN_ID, merged.tpsl_txnId),
    txn_amt: pick(merged.txn_amt, merged.txnAmt, merged.TXN_AMT, merged.amount),
    clnt_rqst_meta: pick(merged.clnt_rqst_meta, merged.clntRqstMeta, merged.CLNT_RQST_META),
    tpsl_txn_time: pick(merged.tpsl_txn_time, merged.tpslTxnTime, merged.TPSL_TXN_TIME),
    bal_amt: pick(merged.bal_amt, merged.balAmt, merged.BAL_AMT),
    card_id: pick(merged.card_id, merged.cardId, merged.CARD_ID),
    alias_name: pick(merged.alias_name, merged.aliasName, merged.ALIAS_NAME),
    BankTransactionID: pick(merged.BankTransactionID, merged.bankTransactionId, merged.bank_transaction_id),
    mandate_reg_no: pick(merged.mandate_reg_no, merged.mandateRegNo, merged.MANDATE_REG_NO),
    token: pick(merged.token, merged.TOKEN),
    hash: pick(merged.hash, merged.HASH),
  };
}

function logWorldlinePostNormalize(context, rawKeys, normalized) {
  const n = normalized || {};
  const hasTxnStatus = String(n.txn_status || '').trim() !== '';
  const hasHash = String(n.hash || n.HASH || '').trim() !== '';
  const normKeys = n && typeof n === 'object' ? Object.keys(n) : [];
  const hashStr = String(n.hash || n.HASH || '');
  logger.info('Worldline post-normalize (verification fields)', {
    context,
    rawKeys,
    normalizedKeys: normKeys,
    hasTxnStatus,
    hasHash,
    pipeParsed: lastWorldlineMsgPipeParsed,
    parsedTxnStatus: String(n.txn_status || '').trim(),
    parsedTpslTxnId: String(n.tpsl_txn_id || '').trim(),
    parsedHashPrefix: hashStr ? hashStr.slice(0, 16) : '',
  });
}

function logWorldlineCallbackPayload(context, raw) {
  const rawKeys = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [];
  const msgVal = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.msg : undefined;
  logger.info('Worldline callback payload (raw)', {
    context,
    rawKeyCount: rawKeys.length,
    rawKeys,
    msgIsString: typeof msgVal === 'string',
    msgLooksLikePipe:
      typeof msgVal === 'string' && msgVal.trimStart().length > 0 && !msgVal.trimStart().startsWith('{'),
    /** Full body — search logs for this label; truncate only in log processors if needed */
    rawBodyJson: (() => {
      try {
        return JSON.stringify(raw);
      } catch (e) {
        return `[non-serializable: ${e?.message || e}]`;
      }
    })(),
  });
}

function incompleteWorldlineVerificationPayload(normalized) {
  const hasHash = String(normalized?.hash || normalized?.HASH || '').trim() !== '';
  const hasTxnStatus = String(normalized?.txn_status || '').trim() !== '';
  return !hasHash && !hasTxnStatus;
}

const WORLDLINE_ERROR_INCOMPLETE_NORMALIZE =
  'Unusable payload: txn_status/hash not found after normalization';
const WORLDLINE_ERROR_HASH_MISMATCH_EMPTY_TPSL =
  'hash_mismatch: tpsl_txn_id missing, likely msg was not parsed correctly';

/**
 * Official Paynimo txn_status semantics:
 * 0300 = Success, 0398 = Initiated, 0399 = Failure, 0396 = Awaited, 0392 = Aborted.
 * "Awaited" (0396) means the bank/UPI confirmation is still pending — it must map to
 * `pending`, never `failed`, or genuine payments get voided while still in flight.
 */
function mapStatus(statusCodeOrTxnStatus) {
  const code = String(statusCodeOrTxnStatus || '').trim();
  const lower = code.toLowerCase();
  if (code === '0300' || lower === 'success') return 'success';
  if (
    code === '0392' ||
    code === '0002' ||
    lower === 'cancelled' ||
    lower === 'canceled' ||
    lower === 'cancel' ||
    lower === 'user_cancelled' ||
    lower === 'user_canceled' ||
    lower === 'aborted' ||
    lower === 'abort'
  ) {
    return 'cancelled';
  }
  if (code === '0396' || code === '0398' || lower === 'pending') return 'pending';
  if (
    code === '0399' ||
    lower === 'failed' ||
    lower === 'failure' ||
    lower === 'error' ||
    lower === 'timeout'
  ) {
    return 'failed';
  }
  if (!code) return 'unknown';
  return 'failed';
}

function mapStatusLabel(statusCode) {
  const code = String(statusCode || '').trim();
  const statusLabelMap = {
    '0300': 'Captured',
    '0392': 'Cancelled by User',
    '0396': 'Awaited (Pending Confirmation)',
    '0398': 'Pending',
    '0399': 'Failed',
    '0002': 'Cancelled',
  };
  return statusLabelMap[code] || 'Unknown';
}

function formatTimeElapsed(secondsInput) {
  const seconds = Math.max(0, Math.floor(Number(secondsInput) || 0));
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  return `${Math.floor(seconds / 86400)} days`;
}

function isTerminal(status) {
  return status === 'success' || status === 'failed' || status === 'cancelled';
}

/**
 * Canonical payment outcome for client UI (retry screen, toasts, navigation).
 * Clients must render from this field — do not infer from uiState alone.
 *
 * Values: SUCCESS | PENDING | AWAITING_PAYMENT | INITIATED | FAILED |
 *         CANCELLED | USER_CANCELLED | ABORTED | TIMEOUT
 */
function resolvePaymentOutcome(payment) {
  if (!payment) return 'AWAITING_PAYMENT';

  const status = String(payment.status || '').toLowerCase();
  const statusCode = String(payment.statusCode || '').trim();
  const verificationError = String(payment.verificationError || 'none').toLowerCase();
  const msg = String(payment.statusMessage || payment.lastFailureReason || '').toLowerCase();
  const expiresAt = payment.sessionExpiresAt ? new Date(payment.sessionExpiresAt).getTime() : null;
  const isExpired = expiresAt != null && Number.isFinite(expiresAt) && Date.now() > expiresAt;

  if (status === 'success' && verificationError === 'none') {
    return 'SUCCESS';
  }
  if (status === 'success') {
    return 'PENDING';
  }
  if (status === 'pending') {
    return 'PENDING';
  }

  // Session timed out before a terminal gateway result.
  if (isExpired && !isTerminal(status)) {
    return 'TIMEOUT';
  }
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('took too long') ||
    msg.includes('session expired')
  ) {
    return 'TIMEOUT';
  }

  if (status === 'cancelled') {
    if (statusCode === '0392' || msg.includes('user cancel') || msg.includes('cancelled by user')) {
      return 'USER_CANCELLED';
    }
    if (msg.includes('abort')) {
      return 'ABORTED';
    }
    return 'CANCELLED';
  }

  if (status === 'failed') {
    return 'FAILED';
  }
  if (status === 'initiated') {
    return 'INITIATED';
  }
  if (status === 'created') {
    return 'AWAITING_PAYMENT';
  }
  if (status === 'unknown') {
    return 'PENDING';
  }

  return 'AWAITING_PAYMENT';
}

/** Payment-session notifications only ever apply to gateway prepayment orders. */
function isGatewayPrepaymentOrder(order) {
  const methodType = order?.paymentMethod?.methodType;
  return methodType === 'card' || methodType === 'upi' || methodType === 'digital';
}

/** Only notify a session timeout the customer just experienced — never resurface old history. */
const TIMEOUT_NOTIFY_WINDOW_MS = 60 * 60 * 1000; // 1 hour after session expiry

/**
 * Notify "Payment session expired" exactly once per payment attempt.
 * Claims the attempt atomically so polling/list reconciliation never double-sends.
 * Never notifies for:
 * - non-gateway orders (COD/wallet have no payment session — nothing can expire),
 * - cancelled or already-paid orders (the order outcome supersedes the session),
 * - sessions that expired long ago (lazy reconciliation of old attempts must not
 *   fire misattributed notifications whenever the customer next opens their orders).
 * Stale/ineligible attempts are still claimed silently so they can never fire later.
 */
async function maybeNotifyPaymentTimeout(payment, order) {
  if (!payment || !order) return;
  if (isTerminal(payment.status)) return;
  const expiresAtMs = payment.sessionExpiresAt ? new Date(payment.sessionExpiresAt).getTime() : null;
  const expired = expiresAtMs != null && Date.now() > expiresAtMs;
  if (!expired) return;

  const claimed = await WorldlinePayment.findOneAndUpdate(
    {
      _id: payment._id,
      timeoutNotified: { $ne: true },
      status: { $nin: ['success', 'failed', 'cancelled'] },
    },
    { $set: { timeoutNotified: true } },
    { new: true }
  ).lean();
  if (!claimed) return;

  if (!isGatewayPrepaymentOrder(order)) {
    logger.warn('payment timeout notification suppressed: non-gateway order has a payment session', {
      paymentId: String(payment._id),
      orderId: String(order._id),
      methodType: order?.paymentMethod?.methodType,
    });
    return;
  }
  if (order.status === 'cancelled' || order.paymentStatus === 'paid') {
    logger.info('payment timeout notification suppressed: order already resolved', {
      paymentId: String(payment._id),
      orderId: String(order._id),
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
    });
    return;
  }
  if (Date.now() - expiresAtMs > TIMEOUT_NOTIFY_WINDOW_MS) {
    logger.info('payment timeout notification suppressed: session expired too long ago', {
      paymentId: String(payment._id),
      orderId: String(order._id),
      expiredAt: new Date(expiresAtMs).toISOString(),
    });
    return;
  }

  try {
    const { sendPaymentOutcomeNotification } = require('./notificationService');
    await sendPaymentOutcomeNotification(order, 'timeout');
  } catch (e) {
    logger.warn('payment timeout notification failed', { paymentId: String(payment._id), error: e?.message });
  }
}

/** Wallet top-up payment failed/cancelled after verification — money was not added. */
async function notifyWalletTopUpFailure(payment) {
  if (!payment || String(payment.purpose || '') !== 'wallet_topup') return;
  try {
    const { sendPushNotification } = require('./notificationService');
    await sendPushNotification(payment.userId, 'WALLET_PAYMENT_FAILED', {
      amount: payment.amountInr,
      reason: payment.statusMessage || '',
    });
  } catch (e) {
    logger.warn('wallet top-up failure notification failed', { paymentId: String(payment._id), error: e?.message });
  }
}

/**
 * After a verified Worldline success for purpose=wallet_topup, credit the customer wallet once.
 * Safe against webhook + app complete + status poll retries.
 */
async function maybeCreditWalletForSuccessfulPayment(paymentInput) {
  if (!paymentInput) return null;
  const paymentId = paymentInput._id || paymentInput.id;
  if (!paymentId) return null;
  if (String(paymentInput.purpose || '') !== 'wallet_topup') return null;
  if (paymentInput.status !== 'success' || paymentInput.verificationError !== 'none') return null;

  const claimed = await WorldlinePayment.findOneAndUpdate(
    { _id: paymentId, purpose: 'wallet_topup', walletCredited: { $ne: true } },
    { $set: { walletCredited: true, walletCreditedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    return { alreadyCredited: true };
  }

  try {
    const result = await creditWallet(claimed.userId, claimed.amountInr, {
      source: 'payment_topup',
      description: 'Money added to wallet',
      referenceId: claimed.txnId,
      referenceType: 'payment',
    });

    if (result.error) {
      await WorldlinePayment.updateOne(
        { _id: claimed._id },
        { $set: { walletCredited: false }, $unset: { walletCreditedAt: 1 } }
      );
      logger.error('Wallet top-up credit failed after verified payment', {
        paymentId: String(claimed._id),
        txnId: claimed.txnId,
        error: result.error,
      });
      return { error: result.error };
    }

    try {
      const { sendPushNotification } = require('./notificationService');
      sendPushNotification(claimed.userId, 'WALLET_CREDIT', {
        amount: result.credited || claimed.amountInr,
        balance: result.balance,
      }).catch(() => {});
    } catch (_) {
      /* optional */
    }

    logger.info('Wallet topped up after Worldline payment', {
      paymentId: String(claimed._id),
      txnId: claimed.txnId,
      userId: String(claimed.userId),
      amount: claimed.amountInr,
      balance: result.balance,
      alreadyCredited: !!result.alreadyCredited,
    });

    return result;
  } catch (err) {
    await WorldlinePayment.updateOne(
      { _id: claimed._id },
      { $set: { walletCredited: false }, $unset: { walletCreditedAt: 1 } }
    );
    logger.error('Wallet top-up credit exception', {
      paymentId: String(claimed._id),
      error: err?.message,
    });
    throw err;
  }
}

/**
 * Type O helper: find callback-verified payment snapshot by transaction + order.
 * Never throws; returns null on db issues / no record.
 */
async function findPaymentByTxnAndOrder(txnId, orderId, expectedAmount) {
  try {
    const normalizedTxnId = String(txnId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedTxnId || !normalizedOrderId) return null;
    if (!mongoose.Types.ObjectId.isValid(normalizedOrderId)) return null;

    const payment = await WorldlinePayment.findOne({
      txnId: normalizedTxnId,
      orderId: new mongoose.Types.ObjectId(normalizedOrderId),
    }).lean();

    if (!payment) return null;

    const requestedAmountRaw = expectedAmount == null ? '' : String(expectedAmount).trim();
    if (requestedAmountRaw !== '') {
      const requestedAmount = Number(requestedAmountRaw);
      const storedAmount = Number(payment.amountInr);
      if (
        Number.isFinite(requestedAmount) &&
        Number.isFinite(storedAmount) &&
        requestedAmount.toFixed(2) !== storedAmount.toFixed(2)
      ) {
        return {
          ...payment,
          _amountMismatch: true,
          _requestedAmount: requestedAmount.toFixed(2),
          _storedAmount: storedAmount.toFixed(2),
        };
      }
    }

    return payment;
  } catch (error) {
    logger.error('Type O payment lookup failed', {
      txnId: String(txnId || ''),
      orderId: String(orderId || ''),
      error: error?.message || String(error),
    });
    return null;
  }
}

function verifyGatewayResponse({ payment, response, salt, logContext }) {
  const rawKeys = response && typeof response === 'object' && !Array.isArray(response) ? Object.keys(response) : [];
  const normalized = normalizeWorldlineGatewayPayload(response);
  logWorldlinePostNormalize(logContext || 'verifyGatewayResponse', rawKeys, normalized);
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

  const expectedHash = computeResponseHash({ msgOrder, response: normalized, salt, deviceId: payment.deviceId });
  const receivedHash = String(normalized?.hash || normalized?.HASH || '').trim();
  const hashOk = receivedHash && expectedHash.toLowerCase() === receivedHash.toLowerCase();

  const receivedAmount = Number(normalized?.txn_amt ?? normalized?.txnAmt ?? NaN);
  const amountOk = Number.isFinite(receivedAmount) ? receivedAmount === Number(payment.amountInr) : true;

  let verificationError = 'none';
  if (!hashOk) verificationError = 'hash_mismatch';
  else if (!amountOk) verificationError = 'amount_mismatch';

  const incomplete = incompleteWorldlineVerificationPayload(normalized);
  const tpslEmpty = !String(normalized?.tpsl_txn_id || '').trim();
  let payloadError = null;
  if (incomplete) {
    payloadError = WORLDLINE_ERROR_INCOMPLETE_NORMALIZE;
  } else if (verificationError === 'hash_mismatch' && tpslEmpty) {
    payloadError = WORLDLINE_ERROR_HASH_MISMATCH_EMPTY_TPSL;
  }

  return {
    hashOk,
    amountOk,
    verificationError,
    receivedHash,
    normalized,
    payloadError,
    statusCode: String(normalized?.txn_status || normalized?.statusCode || '').trim(),
    statusMessage: String(normalized?.txn_msg || normalized?.txn_err_msg || ''),
  };
}

async function createSession(userId, { orderId, platform, algo, consumerEmailId, consumerMobileNo, paymentMode, checkoutOrigin }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  warnWorldlineMerchantEnvMismatchOnce();

  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) return { error: 'platform must be android, ios, or web' };

  const deviceId = deviceIdForPlatform(normalizedPlatform, algo);
  if (!deviceId) return { error: 'Unable to determine deviceId for platform' };

  const merchantId = trimEnv(process.env.WORLDLINE_MERCHANT_ID || process.env.WORLDLINE_MERCHANT_CODE);
  const schemeCode = trimEnv(process.env.WORLDLINE_SCHEME_CODE) || 'FIRST';
  const salt = trimEnv(process.env.WORLDLINE_SALT);
  const safeCheckoutOrigin = sanitizeCheckoutOrigin(checkoutOrigin, logger) || '';
  const returnUrl = resolveReturnUrlForPlatform(normalizedPlatform, logger, safeCheckoutOrigin || undefined);

  if (!merchantId || !salt || !returnUrl) return { error: 'Worldline configuration incomplete' };

  const order = await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!order) return { error: 'Order not found' };

  // COD/wallet orders have no online payment session — creating one would attach
  // gateway state (and later "session expired" notifications) to an order that
  // must only ever receive order-lifecycle notifications.
  if (!isGatewayPrepaymentOrder(order)) {
    return {
      error:
        'This order does not use online payment — no payment session is required.',
    };
  }

  // Money-safety: a cancelled order is never resurrected on payment success,
  // so charging it would take money without delivering. A paid order must not
  // be charged twice.
  if (order.status === 'cancelled') {
    return {
      error:
        'This order was cancelled. Please place a new order — your items were restored to the cart.',
    };
  }
  if (order.paymentStatus === 'paid') {
    return { error: 'This order is already paid.' };
  }

  const walletPart = Number(order.walletDeduction) || 0;
  const chargedAmount =
    walletPart > 0
      ? order.onlineAmountDue != null && Number(order.onlineAmountDue) >= 0
        ? Number(order.onlineAmountDue)
        : Math.max(0, Number(order.totalBill || 0) - walletPart)
      : Number(order.totalBill || 0);
  const amountStr = formatWorldlineTxnAmount(chargedAmount);
  const { min, max } = getAmountLimits();
  if (!(chargedAmount >= min && chargedAmount <= max)) {
    return { error: worldlineAmountRangeError(chargedAmount, min, max) };
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
  // Must match SDK/JSON: use '' when missing (not undefined), so pipe string matches gateway rebuild.
  const mobileForHash = consumerMobileNo ? String(consumerMobileNo).trim() : '';
  const emailForHash = consumerEmailId ? String(consumerEmailId).trim() : '';

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

  const resolvedPaymentMode = canonicalizePaynimoPaymentMode(paymentMode);

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
      paymentMode: resolvedPaymentMode,
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

  // $setOnInsert alone skips updates when the doc already exists — stale token/txnId vs new session payload.
  const doc = await WorldlinePayment.findOneAndUpdate(
    { orderId, attemptNo },
    {
      $set: {
        token,
        txnId,
        deviceId,
        amountInr: chargedAmount,
        status: 'created',
        sessionExpiresAt,
        rawSessionRequest: sessionPayload,
        ...(safeCheckoutOrigin ? { checkoutOrigin: safeCheckoutOrigin } : {}),
      },
      $setOnInsert: {
        userId: new mongoose.Types.ObjectId(userId),
        orderId: new mongoose.Types.ObjectId(orderId),
        idempotencyKey,
        merchantId,
        schemeCode,
        platform: normalizedPlatform,
        attemptNo,
      },
    },
    { upsert: true, new: true }
  ).lean();

  logger.info('Worldline session managed', {
    orderId: String(orderId),
    txnId: doc.txnId,
    attemptNo: doc.attemptNo,
    isNew: shouldCreateNew,
    checkoutOrigin: safeCheckoutOrigin || null,
  });

  let returnUrlHost = null;
  try {
    returnUrlHost = returnUrl ? new URL(returnUrl).host : null;
  } catch {
    returnUrlHost = null;
  }
  logger.info('Worldline session environment (credentials are never logged)', {
    nodeEnv: process.env.NODE_ENV,
    hashAlgo: resolveWorldlineHashAlgo(algo),
    platform: normalizedPlatform,
    deviceId,
    returnUrlHost,
    merchantIdLength: merchantId.length,
    merchantIdLen: merchantId.length,
    schemeCode,
  });

  return {
    data: {
      paymentId: String(doc._id),
      orderId: String(orderId),
      txnId: doc.txnId,
      attemptNo: doc.attemptNo,
      hashAlgo: resolveWorldlineHashAlgo(algo),
      sessionPayload,
    },
  };
}

/**
 * Start a Paynimo session to add money to the customer wallet.
 * Credits the wallet only after verified payment success (see maybeCreditWalletForSuccessfulPayment).
 */
async function createWalletTopUpSession(userId, {
  amount,
  platform = 'web',
  algo,
  consumerEmailId,
  consumerMobileNo,
  paymentMode,
  checkoutOrigin,
}) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  warnWorldlineMerchantEnvMismatchOnce();

  const uidRaw = userId != null ? String(userId).trim() : '';
  if (!uidRaw || !mongoose.Types.ObjectId.isValid(uidRaw)) {
    return { error: 'Authenticated user id is required' };
  }
  const userObjectId = new mongoose.Types.ObjectId(uidRaw);

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return { error: 'Invalid amount' };
  }
  if (parsedAmount > MAX_TOP_UP_AMOUNT) {
    return { error: `Amount cannot exceed ₹${MAX_TOP_UP_AMOUNT}` };
  }

  const { min, max } = getAmountLimits();
  if (!(parsedAmount >= min && parsedAmount <= max)) {
    return {
      error:
        `Wallet top-up amount must be between ₹${min} and ₹${max} in this payment environment. ` +
        `Requested ₹${Math.round(parsedAmount * 100) / 100}.`,
    };
  }

  const normalizedPlatform = normalizePlatform(platform) || 'web';
  const deviceId = deviceIdForPlatform(normalizedPlatform, algo);
  if (!deviceId) return { error: 'Unable to determine deviceId for platform' };

  const merchantId = trimEnv(process.env.WORLDLINE_MERCHANT_ID || process.env.WORLDLINE_MERCHANT_CODE);
  const schemeCode = trimEnv(process.env.WORLDLINE_SCHEME_CODE) || 'FIRST';
  const salt = trimEnv(process.env.WORLDLINE_SALT);
  const safeCheckoutOrigin = sanitizeCheckoutOrigin(checkoutOrigin, logger) || '';
  const returnUrl = resolveReturnUrlForPlatform(normalizedPlatform, logger, safeCheckoutOrigin || undefined);
  if (!merchantId || !salt || !returnUrl) return { error: 'Worldline configuration incomplete' };

  const amountStr = formatWorldlineTxnAmount(parsedAmount);
  const externalOrderRef = `wallet-${String(userObjectId).slice(-8)}-${uuidv4().slice(0, 8)}`;
  const syntheticOrderId = syntheticOrderObjectIdForExternalRef(externalOrderRef, userObjectId);

  const latestAttempt = await WorldlinePayment.findOne({
    purpose: 'wallet_topup',
    standaloneCheckout: true,
    userId: userObjectId,
    amountInr: parsedAmount,
    platform: normalizedPlatform,
    status: { $nin: ['success', 'failed', 'cancelled'] },
  }).sort({ attemptNo: -1 });

  let attemptNo = 1;
  let txnId;
  let shouldCreateNew = true;

  if (latestAttempt) {
    const isExpired = latestAttempt.sessionExpiresAt && new Date() > latestAttempt.sessionExpiresAt;
    if (!isExpired) {
      txnId = latestAttempt.txnId;
      attemptNo = latestAttempt.attemptNo;
      shouldCreateNew = false;
    }
  }

  if (shouldCreateNew) {
    const lastForRef = await WorldlinePayment.findOne({
      purpose: 'wallet_topup',
      orderId: syntheticOrderId,
    }).sort({ attemptNo: -1 });
    attemptNo = lastForRef ? lastForRef.attemptNo + 1 : 1;
    txnId = `${Date.now()}-${uuidv4().slice(0, 8)}-${attemptNo}`;
  }

  // When reusing an active session, return its existing payload.
  if (!shouldCreateNew && latestAttempt) {
    return {
      data: {
        paymentId: String(latestAttempt._id),
        purpose: 'wallet_topup',
        clientOrderRef: latestAttempt.externalOrderRef,
        orderId: String(latestAttempt.orderId),
        txnId: latestAttempt.txnId,
        attemptNo: latestAttempt.attemptNo,
        amount: latestAttempt.amountInr,
        hashAlgo: resolveWorldlineHashAlgo(algo),
        sessionPayload: latestAttempt.rawSessionRequest,
      },
    };
  }

  const consumerId = String(userObjectId).slice(-20);
  const mobileForHash = consumerMobileNo ? String(consumerMobileNo).trim() : '';
  const emailForHash = consumerEmailId ? String(consumerEmailId).trim() : '';

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

  const resolvedPaymentMode = canonicalizePaynimoPaymentMode(paymentMode);
  const idempotencyKey = `worldline:wallet_topup:${String(userObjectId)}:${externalOrderRef}:${normalizedPlatform}:${attemptNo}`;

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
      paymentMode: resolvedPaymentMode,
      merchantId,
      currency: 'INR',
      consumerId,
      consumerMobileNo: mobileForHash,
      consumerEmailId: emailForHash,
      txnId,
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

  const sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const doc = await WorldlinePayment.findOneAndUpdate(
    { orderId: syntheticOrderId, attemptNo },
    {
      $set: {
        token,
        txnId,
        deviceId,
        amountInr: parsedAmount,
        status: 'created',
        sessionExpiresAt,
        rawSessionRequest: sessionPayload,
        standaloneCheckout: true,
        externalOrderRef,
        purpose: 'wallet_topup',
        walletCredited: false,
        walletCreditedAt: null,
        ...(safeCheckoutOrigin ? { checkoutOrigin: safeCheckoutOrigin } : {}),
      },
      $setOnInsert: {
        userId: userObjectId,
        orderId: syntheticOrderId,
        idempotencyKey,
        merchantId,
        schemeCode,
        platform: normalizedPlatform,
        attemptNo,
      },
    },
    { upsert: true, new: true }
  ).lean();

  logger.info('Worldline wallet top-up session', {
    userId: String(userObjectId),
    externalOrderRef,
    orderId: String(syntheticOrderId),
    txnId: doc.txnId,
    amount: parsedAmount,
    attemptNo: doc.attemptNo,
    checkoutOrigin: safeCheckoutOrigin || null,
  });

  return {
    data: {
      paymentId: String(doc._id),
      purpose: 'wallet_topup',
      clientOrderRef: externalOrderRef,
      orderId: String(syntheticOrderId),
      txnId: doc.txnId,
      attemptNo: doc.attemptNo,
      amount: parsedAmount,
      hashAlgo: resolveWorldlineHashAlgo(algo),
      sessionPayload,
    },
  };
}

/**
 * Standalone Paynimo session (string client order ref, amount from body). No CustomerOrder row.
 * @param {string|import('mongoose').Types.ObjectId} userId — authenticated customer (JWT `sub`), required.
 */
async function createStandalonePaymentSession({
  externalOrderRef,
  amountInr,
  consumerEmailId,
  consumerMobileNo,
  platform,
  algo,
  paymentMode,
  userId: userIdInput,
}) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  warnWorldlineMerchantEnvMismatchOnce();
  if (!standaloneInitiateEnabled()) {
    return {
      error:
        'Standalone payment initiate is disabled. Set PAYMENT_STANDALONE_INITIATE=true or run with NODE_ENV!=production',
    };
  }

  const ref = String(externalOrderRef || '').trim();
  if (!ref) return { error: 'orderId (client reference) is required' };

  const uidRaw = userIdInput != null ? String(userIdInput).trim() : '';
  if (!uidRaw || !mongoose.Types.ObjectId.isValid(uidRaw)) {
    return { error: 'Authenticated user id is required' };
  }
  const userId = new mongoose.Types.ObjectId(uidRaw);

  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) return { error: 'platform must be android, ios, or web (or omit for default android)' };

  const deviceId = deviceIdForPlatform(normalizedPlatform, algo);
  if (!deviceId) return { error: 'Unable to determine deviceId for platform' };

  const merchantId = trimEnv(process.env.WORLDLINE_MERCHANT_ID || process.env.WORLDLINE_MERCHANT_CODE);
  const schemeCode = trimEnv(process.env.WORLDLINE_SCHEME_CODE) || 'FIRST';
  const salt = trimEnv(process.env.WORLDLINE_SALT);
  const returnUrl = resolveReturnUrlForPlatform(normalizedPlatform, logger);
  if (!merchantId || !salt || !returnUrl) return { error: 'Worldline configuration incomplete' };

  const amount = Number(amountInr);
  const amountStr = formatWorldlineTxnAmount(amount);
  const { min, max } = getAmountLimits();
  if (!(amount >= min && amount <= max)) {
    return { error: worldlineAmountRangeError(amount, min, max) };
  }

  const syntheticOrderId = syntheticOrderObjectIdForExternalRef(ref, userId);

  const latestAttempt = await WorldlinePayment.findOne({
    standaloneCheckout: true,
    externalOrderRef: ref,
    platform: normalizedPlatform,
    userId,
  }).sort({ attemptNo: -1 });

  let attemptNo = 1;
  let txnId;
  let shouldCreateNew = true;

  if (latestAttempt) {
    const isExpired = latestAttempt.sessionExpiresAt && new Date() > latestAttempt.sessionExpiresAt;
    if (!isTerminal(latestAttempt.status) && !isExpired) {
      txnId = latestAttempt.txnId;
      attemptNo = latestAttempt.attemptNo;
      shouldCreateNew = false;
    } else {
      attemptNo = latestAttempt.attemptNo + 1;
    }
  }

  if (shouldCreateNew) {
    txnId = `${Date.now()}-${uuidv4().slice(0, 8)}-${attemptNo}`;
  }

  const consumerId = String(userId).slice(-20);
  const mobileForHash = consumerMobileNo ? String(consumerMobileNo).trim() : '';
  const emailForHash = consumerEmailId ? String(consumerEmailId).trim() : '';

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

  const resolvedPaymentMode = canonicalizePaynimoPaymentMode(paymentMode);

  const idempotencyKey = `worldline:standalone:${String(userId)}:${ref}:${normalizedPlatform}:${attemptNo}`;

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
      paymentMode: resolvedPaymentMode,
      merchantId,
      currency: 'INR',
      consumerId,
      consumerMobileNo: mobileForHash,
      consumerEmailId: emailForHash,
      txnId,
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

  const sessionDurationMs = 30 * 60 * 1000;
  const sessionExpiresAt = new Date(Date.now() + sessionDurationMs);

  const doc = await WorldlinePayment.findOneAndUpdate(
    { orderId: syntheticOrderId, attemptNo },
    {
      $set: {
        token,
        txnId,
        deviceId,
        amountInr: amount,
        status: 'created',
        sessionExpiresAt,
        rawSessionRequest: sessionPayload,
        standaloneCheckout: true,
        externalOrderRef: ref,
      },
      $setOnInsert: {
        userId,
        orderId: syntheticOrderId,
        idempotencyKey,
        merchantId,
        schemeCode,
        platform: normalizedPlatform,
        attemptNo,
      },
    },
    { upsert: true, new: true }
  ).lean();

  logger.info('Worldline standalone session', {
    externalOrderRef: ref,
    internalOrderId: String(syntheticOrderId),
    txnId: doc.txnId,
    attemptNo: doc.attemptNo,
  });

  let standaloneReturnUrlHost = null;
  try {
    standaloneReturnUrlHost = returnUrl ? new URL(returnUrl).host : null;
  } catch {
    standaloneReturnUrlHost = null;
  }
  logger.info('Worldline standalone session environment (credentials are never logged)', {
    nodeEnv: process.env.NODE_ENV,
    hashAlgo: resolveWorldlineHashAlgo(algo),
    platform: normalizedPlatform,
    deviceId,
    returnUrlHost: standaloneReturnUrlHost,
    merchantIdLength: merchantId.length,
    schemeCode,
  });

  return {
    data: {
      paymentId: String(doc._id),
      clientOrderRef: ref,
      /** Pass this `orderId` to POST /api/payment/callback (app/SDK complete) flows that expect a Mongo-shaped id. */
      orderId: String(syntheticOrderId),
      txnId: doc.txnId,
      attemptNo: doc.attemptNo,
      hashAlgo: resolveWorldlineHashAlgo(algo),
      sessionPayload,
    },
  };
}

async function getStandalonePaymentStatus(externalOrderRef, userIdInput) {
  const ref = String(externalOrderRef || '').trim();
  if (!ref) return { error: 'orderId is required' };

  const uidRaw = userIdInput != null ? String(userIdInput).trim() : '';
  if (!uidRaw || !mongoose.Types.ObjectId.isValid(uidRaw)) {
    return { error: 'Authenticated user id is required' };
  }
  const userId = new mongoose.Types.ObjectId(uidRaw);

  const payments = await WorldlinePayment.find({
    standaloneCheckout: true,
    externalOrderRef: ref,
    userId,
  }).sort({
    attemptNo: -1,
  });
  const payment = payments[0];

  let uiState = 'WAITING_FOR_PAYMENT';
  let recommendedAction = 'NONE';

  if (!payment) {
    uiState = 'WAITING_FOR_PAYMENT';
    recommendedAction = 'CREATE_SESSION';
  } else {
    const isExpired = payment.sessionExpiresAt && new Date() > payment.sessionExpiresAt;
    if (payment.status === 'success' && payment.verificationError === 'none') {
      uiState = 'PAID';
      recommendedAction = 'NONE';
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
    } else if (payment.status === 'failed') {
      uiState = 'FAILED';
      recommendedAction = 'RETRY_PAYMENT';
    } else if (payment.status === 'cancelled') {
      uiState = 'RETRY_AVAILABLE';
      recommendedAction = 'RETRY_PAYMENT';
    }
  }

  return {
    data: {
      clientOrderRef: ref,
      orderId: payment ? String(payment.orderId) : null,
      uiState,
      recommendedAction,
      paymentOutcome: resolvePaymentOutcome(payment),
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
            tpslTxnId: payment.tpslTxnId,
            bankTxnId: payment.bankTxnId,
          }
        : null,
      allAttempts: payments.map((p) => ({
        txnId: p.txnId,
        attemptNo: p.attemptNo,
        status: p.status,
        statusCode: p.statusCode,
        verificationError: p.verificationError,
        createdAt: p.createdAt,
      })),
    },
  };
}

async function resolvePaymentContextFromGatewayResponse(userId, response) {
  const normalized = normalizeWorldlineGatewayPayload(response || {});
  const txnId = String(
    normalized.clnt_txn_ref ||
      response?.clnt_txn_ref ||
      response?.txnId ||
      response?.TXN_ID ||
      response?.clntTxnRef ||
      ''
  ).trim();
  if (!txnId) return { error: 'Could not resolve transaction id from gateway response' };

  const payment = await WorldlinePayment.findOne({ txnId });
  if (!payment) return { error: 'Payment session not found for txnId' };
  if (String(payment.userId) !== String(userId)) return { error: 'Unauthorized' };

  return { orderId: String(payment.orderId), txnId };
}

async function completePayment(userId, { orderId, txnId, response, clientDebug }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };

  const salt = trimEnv(process.env.WORLDLINE_SALT);
  if (!salt) return { error: 'Worldline configuration incomplete' };

  const payment = await WorldlinePayment.findOne({ orderId: new mongoose.Types.ObjectId(orderId), txnId: String(txnId) });
  if (!payment) return { error: 'Payment session not found for order/txnId' };

  if (payment.standaloneCheckout) {
    if (String(payment.userId) !== String(userId)) return { error: 'Unauthorized' };
  }

  const order =
    payment.standaloneCheckout ? null : await Order.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(userId) });
  if (!payment.standaloneCheckout && !order) return { error: 'Order not found' };

  // Idempotency: if already processed to a terminal status, return it as-is.
  if (isTerminal(payment.status) && payment.responseHash) {
    if (payment.status === 'success' && payment.verificationError === 'none') {
      if (order) {
        try {
          await releaseOrderFulfillment(String(orderId));
        } catch (e) {
          logger.warn('releaseOrderFulfillment idempotent path failed', { orderId: String(orderId), error: e?.message });
        }
      }
      try {
        await maybeCreditWalletForSuccessfulPayment(payment);
      } catch (e) {
        logger.warn('wallet top-up credit idempotent path failed', { orderId: String(orderId), error: e?.message });
      }
    }
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
        purpose: payment.purpose || 'order',
      },
    };
  }

  logWorldlineCallbackPayload('completePayment', response);

  if (clientDebug && typeof clientDebug === 'object') {
    logger.warn('Worldline complete: client attached SDK debug metadata', {
      orderId: String(orderId),
      txnId: String(txnId),
      clientDebug,
    });
  }

  const rawTopKeys = response && typeof response === 'object' && !Array.isArray(response) ? Object.keys(response) : [];

  const { hashOk, amountOk, verificationError, receivedHash, statusCode, statusMessage, normalized, payloadError } =
    verifyGatewayResponse({
      payment,
      response,
      salt,
      logContext: 'completePayment',
    });

  const tpslEmpty = !String(normalized?.tpsl_txn_id || '').trim();

  const mapped = mapStatus(statusCode);

  const rawGatewayResponseStored =
    response && typeof response === 'object' && !Array.isArray(response)
      ? {
          ...response,
          _serverNormalizedKeys: Object.keys(normalized || {}),
          _serverTxnStatus: String(normalized?.txn_status || ''),
          ...(clientDebug && typeof clientDebug === 'object' ? { _clientSdkDebug: clientDebug } : {}),
        }
      : response || null;

  const update = {
    status: mapped,
    statusCode,
    statusMessage,
    verificationSource: 'app_complete',
    verificationError,
    tpslTxnId: String(normalized?.tpsl_txn_id || ''),
    bankTxnId: String(normalized?.BankTransactionID || ''),
    tpslBankCd: String(normalized?.tpsl_bank_cd || ''),
    tpslTxnTime: String(normalized?.tpsl_txn_time || ''),
    responseHash: receivedHash,
    rawGatewayResponse: rawGatewayResponseStored,
  };

  if (!hashOk || !amountOk) {
    // SUCCESS is only ever trusted with a verified hash + matching amount.
    // Cancel/failure codes are honored even when the hash cannot be verified:
    // aborted (0392/0002) and failed (0399) payloads frequently carry no valid
    // hash because no transaction completed, and honoring them can only void
    // an UNPAID order — it can never mark money as collected.
    if (mapped === 'cancelled' || mapped === 'failed') {
      update.status = mapped;
      update.statusMessage =
        statusMessage || (mapped === 'cancelled' ? 'Payment cancelled by user' : 'Payment failed');
    } else {
      update.status = 'unknown';
      if (!hashOk) {
        update.statusMessage = tpslEmpty ? WORLDLINE_ERROR_HASH_MISMATCH_EMPTY_TPSL : 'Hash verification failed';
      } else {
        update.statusMessage = 'Amount mismatch';
      }
    }
  } else if (tpslEmpty) {
    logger.warn('Worldline verify ok but tpsl_txn_id empty (unusual)', {
      orderId: String(orderId),
      txnId: String(txnId),
      rawTopKeys,
    });
  }

  // Use findOneAndUpdate with terminal guard to prevent races
  const finalPayment = await WorldlinePayment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: ['success', 'failed', 'cancelled'] } },
    { $set: update },
    { new: true }
  ).lean();

  const effectivePayment = finalPayment || (await WorldlinePayment.findById(payment._id).lean());

  if (effectivePayment.status === 'success' && effectivePayment.verificationError === 'none') {
    if (order) {
      // Never resurrect a cancelled order: skip paid flip + release (no "Order Placed").
      // A captured payment on a cancelled order needs ops/refund attention instead.
      if (order.status === 'cancelled') {
        logger.warn('Worldline success on cancelled order — refund attention needed', {
          orderId: String(orderId),
          txnId: String(txnId),
        });
      } else {
        order.paymentStatus = 'paid';
        applyWorldlineInstrumentToOrder(order, effectivePayment);
        await order.save();
        try {
          await releaseOrderFulfillment(String(orderId));
        } catch (e) {
          logger.warn('releaseOrderFulfillment failed', { orderId: String(orderId), error: e?.message });
        }
      }
    }
    try {
      await maybeCreditWalletForSuccessfulPayment(effectivePayment);
    } catch (e) {
      logger.warn('wallet top-up credit failed in completePayment', {
        orderId: String(orderId),
        error: e?.message,
      });
    }
  } else if (effectivePayment.status === 'failed' || effectivePayment.status === 'cancelled') {
    // Terminal failed/cancelled always voids the unpaid order — even with a hash
    // mismatch. The status only reaches failed/cancelled via explicit gateway
    // codes, and voiding an unpaid order is a safe (money-free) operation.
    // Never downgrade an order that was already paid (e.g. duplicate/stale
    // callback for an older attempt after a successful retry).
    if (order && order.paymentStatus !== 'paid' && order.fulfillmentReleased !== true) {
      order.paymentStatus = 'failed';
      await order.save();
      try {
        await voidUnpaidOnlineOrder(
          userId,
          orderId,
          effectivePayment.statusMessage || 'Payment failed',
          effectivePayment.status === 'cancelled' ? 'cancelled' : 'failed'
        );
      } catch (e) {
        logger.warn('voidUnpaidOnlineOrder failed', { orderId: String(orderId), error: e?.message });
      }
    }
    // finalPayment set ⇒ this call performed the terminal transition (send once).
    if (finalPayment) {
      await notifyWalletTopUpFailure(effectivePayment);
    }
  } else if (effectivePayment.status === 'pending') {
    // Gateway reported 0398 — verification in progress (e.g. UPI approval pending).
    if (order && finalPayment && payment.status !== 'pending') {
      try {
        const { sendPaymentOutcomeNotification } = require('./notificationService');
        await sendPaymentOutcomeNotification(order, 'pending');
      } catch (e) {
        logger.warn('payment pending notification failed', { orderId: String(orderId), error: e?.message });
      }
    }
  }

  const outOrderId = payment.standaloneCheckout && payment.purpose !== 'wallet_topup' && payment.externalOrderRef
    ? payment.externalOrderRef
    : String(orderId);

  const baseData = {
    orderId: outOrderId,
    txnId: String(txnId),
    status: effectivePayment.status,
    statusCode: effectivePayment.statusCode,
    statusMessage: effectivePayment.statusMessage,
    hashOk: effectivePayment.verificationError === 'none',
    tpslTxnId: effectivePayment.tpslTxnId,
    bankTxnId: effectivePayment.bankTxnId,
    verificationError: effectivePayment.verificationError,
    purpose: payment.purpose || 'order',
  };

  if (payloadError) {
    if (payloadError === WORLDLINE_ERROR_INCOMPLETE_NORMALIZE) {
      logger.error('Worldline payment verification blocked (incomplete payload)', {
        orderId: String(orderId),
        txnId: String(txnId),
        verificationError,
        rawTopKeys,
      });
    } else {
      logger.error('Worldline hash_mismatch with empty tpsl_txn_id', {
        orderId: String(orderId),
        txnId: String(txnId),
        rawTopKeys,
      });
    }
    return { error: payloadError, data: baseData };
  }

  return { data: baseData };
}

/**
 * Worldline can POST/GET to the merchant returnUrl after checkout.
 * This endpoint must not require customer auth (app may not be in control).
 * @param {string|import('mongoose').Types.ObjectId} [allowedUserId] — when set (e.g. JWT app callback), payment must belong to this user.
 */
async function processGatewayReturn({ response, allowedUserId }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  const salt = trimEnv(process.env.WORLDLINE_SALT);
  if (!salt) return { error: 'Worldline configuration incomplete' };

  logWorldlineCallbackPayload('processGatewayReturn', response);
  const normalizedLookup = normalizeWorldlineGatewayPayload(response);
  const txnId = String(
    normalizedLookup.clnt_txn_ref ||
      response?.clnt_txn_ref ||
      response?.txnId ||
      response?.TXN_ID ||
      response?.clntTxnRef ||
      ''
  ).trim();
  if (!txnId) return { error: 'Missing clnt_txn_ref/txnId in gateway response (after normalizing msg / aliases)' };

  const payment = await WorldlinePayment.findOne({ txnId });
  if (!payment) return { error: 'Payment session not found for txnId' };

  if (allowedUserId != null && String(allowedUserId).trim() !== '') {
    if (String(payment.userId) !== String(allowedUserId).trim()) {
      return { error: 'Unauthorized' };
    }
  }

  const order = payment.standaloneCheckout ? null : await Order.findOne({ _id: payment.orderId });
  if (!payment.standaloneCheckout && !order) {
    return {
      error: 'Order not found for payment',
      data: { checkoutOrigin: payment.checkoutOrigin || '', purpose: payment.purpose || 'order' },
    };
  }

  // Idempotency: if already terminal, don't mutate.
  if (isTerminal(payment.status) && payment.responseHash) {
    if (payment.status === 'success' && payment.verificationError === 'none') {
      if (order) {
        try {
          await releaseOrderFulfillment(String(order._id));
        } catch (e) {
          logger.warn('releaseOrderFulfillment gateway return idempotent path failed', {
            orderId: String(order._id),
            error: e?.message,
          });
        }
      }
      try {
        await maybeCreditWalletForSuccessfulPayment(payment);
      } catch (e) {
        logger.warn('wallet top-up credit gateway return idempotent path failed', {
          paymentId: String(payment._id),
          error: e?.message,
        });
      }
    }
    return {
      data: {
        orderId:
          payment.purpose === 'wallet_topup'
            ? String(payment.orderId)
            : payment.standaloneCheckout && payment.externalOrderRef
              ? payment.externalOrderRef
              : String(order._id),
        txnId,
        status: payment.status,
        statusCode: payment.statusCode,
        statusMessage: payment.statusMessage,
        hashOk: payment.verificationError === 'none',
        purpose: payment.purpose || 'order',
        amountInr: payment.amountInr,
        checkoutOrigin: payment.checkoutOrigin || '',
      },
    };
  }

  const rawTopKeys = response && typeof response === 'object' && !Array.isArray(response) ? Object.keys(response) : [];

  const { hashOk, amountOk, verificationError, receivedHash, statusCode, statusMessage, normalized, payloadError } =
    verifyGatewayResponse({
      payment,
      response,
      salt,
      logContext: 'processGatewayReturn',
    });

  const clientDebugFromBody = response?.debug ?? response?.clientSdkDebug;
  const tpslEmpty = !String(normalized?.tpsl_txn_id || '').trim();

  const mapped = mapStatus(statusCode);

  const rawGatewayReturnStored =
    response && typeof response === 'object' && !Array.isArray(response)
      ? {
          ...response,
          _serverNormalizedKeys: Object.keys(normalized || {}),
          _serverTxnStatus: String(normalized?.txn_status || ''),
          ...(clientDebugFromBody && typeof clientDebugFromBody === 'object'
            ? { _clientSdkDebug: clientDebugFromBody }
            : {}),
        }
      : response || null;

  const update = {
    status: mapped,
    statusCode,
    statusMessage,
    verificationSource: 'gateway_return',
    verificationError,
    tpslTxnId: String(normalized?.tpsl_txn_id || ''),
    bankTxnId: String(normalized?.BankTransactionID || ''),
    tpslBankCd: String(normalized?.tpsl_bank_cd || ''),
    tpslTxnTime: String(normalized?.tpsl_txn_time || ''),
    responseHash: receivedHash,
    rawGatewayReturn: rawGatewayReturnStored,
  };

  if (!hashOk || !amountOk) {
    // Same rule as completePayment: success requires hash + amount verification;
    // explicit cancel/failure codes are honored even unverified (only voids an
    // unpaid order, never marks money as collected).
    if (mapped === 'cancelled' || mapped === 'failed') {
      update.status = mapped;
      update.statusMessage =
        statusMessage || (mapped === 'cancelled' ? 'Payment cancelled by user' : 'Payment failed');
    } else {
      update.status = 'unknown';
      if (!hashOk) {
        update.statusMessage = tpslEmpty ? WORLDLINE_ERROR_HASH_MISMATCH_EMPTY_TPSL : 'Hash verification failed';
      } else {
        update.statusMessage = 'Amount mismatch';
      }
    }
  }

  const finalPayment = await WorldlinePayment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: ['success', 'failed', 'cancelled'] } },
    { $set: update },
    { new: true }
  ).lean();

  const effectivePayment = finalPayment || (await WorldlinePayment.findById(payment._id).lean());

  if (effectivePayment.status === 'success' && effectivePayment.verificationError === 'none') {
    if (order) {
      // Never resurrect a cancelled order: skip paid flip + release (no "Order Placed").
      if (order.status === 'cancelled') {
        logger.warn('Worldline gateway return success on cancelled order — refund attention needed', {
          orderId: String(order._id),
          txnId,
        });
      } else {
        order.paymentStatus = 'paid';
        applyWorldlineInstrumentToOrder(order, effectivePayment);
        await order.save();
        try {
          await releaseOrderFulfillment(String(order._id));
        } catch (e) {
          logger.warn('releaseOrderFulfillment gateway return failed', { orderId: String(order._id), error: e?.message });
        }
      }
    }
    try {
      await maybeCreditWalletForSuccessfulPayment(effectivePayment);
    } catch (e) {
      logger.warn('wallet top-up credit failed in processGatewayReturn', {
        paymentId: String(effectivePayment._id),
        error: e?.message,
      });
    }
  } else if (effectivePayment.status === 'failed' || effectivePayment.status === 'cancelled') {
    // Terminal failed/cancelled always voids the unpaid order — even with a hash
    // mismatch. The status only reaches failed/cancelled via explicit gateway codes.
    // Never downgrade an order that was already paid by another attempt.
    if (order && order.paymentStatus !== 'paid' && order.fulfillmentReleased !== true) {
      order.paymentStatus = 'failed';
      await order.save();
      try {
        await voidUnpaidOnlineOrder(
          String(order.userId),
          String(order._id),
          effectivePayment.statusMessage || 'Payment failed',
          effectivePayment.status === 'cancelled' ? 'cancelled' : 'failed'
        );
      } catch (e) {
        logger.warn('voidUnpaidOnlineOrder gateway return failed', { orderId: String(order._id), error: e?.message });
      }
    }
    if (finalPayment) {
      await notifyWalletTopUpFailure(effectivePayment);
    }
  } else if (effectivePayment.status === 'pending') {
    if (order && finalPayment && payment.status !== 'pending') {
      try {
        const { sendPaymentOutcomeNotification } = require('./notificationService');
        await sendPaymentOutcomeNotification(order, 'pending');
      } catch (e) {
        logger.warn('payment pending notification failed', { orderId: String(order._id), error: e?.message });
      }
    }
  }

  const logOrderId = order ? String(order._id) : String(payment.orderId);

  logger.info('Worldline return processed', {
    orderId: logOrderId,
    txnId,
    status: effectivePayment.status,
    statusCode: effectivePayment.statusCode,
    verificationError: effectivePayment.verificationError,
    attemptNo: effectivePayment.attemptNo,
    tpslTxnId: effectivePayment.tpslTxnId,
  });

  const baseData = {
    orderId:
      payment.purpose === 'wallet_topup'
        ? String(payment.orderId)
        : payment.standaloneCheckout && payment.externalOrderRef
          ? payment.externalOrderRef
          : logOrderId,
    txnId,
    status: effectivePayment.status,
    statusCode: effectivePayment.statusCode,
    statusMessage: effectivePayment.statusMessage,
    hashOk: effectivePayment.verificationError === 'none',
    amountOk,
    verificationError: effectivePayment.verificationError,
    tpslTxnId: effectivePayment.tpslTxnId,
    amountInr: effectivePayment.amountInr,
    purpose: payment.purpose || 'order',
    checkoutOrigin: payment.checkoutOrigin || '',
  };

  if (payloadError) {
    if (payloadError === WORLDLINE_ERROR_INCOMPLETE_NORMALIZE) {
      logger.error('Worldline gateway return blocked (incomplete payload)', { txnId, rawTopKeys });
    } else {
      logger.error('Worldline gateway return hash_mismatch with empty tpsl_txn_id', { txnId, rawTopKeys });
    }
    return { error: payloadError, data: baseData };
  }

  return { data: baseData };
}

/**
 * Customer aborted checkout without the gateway producing any response payload
 * (closed the Paynimo window, pressed browser back, cancel without codes).
 * Marks the attempt cancelled and voids the unpaid order immediately, so the
 * "Payment Cancelled" notification is sent right away instead of the
 * reconciliation cron settling it as a session timeout 15+ minutes later.
 *
 * Money-safe: only claims non-terminal attempts (atomic guard) and can only
 * void an UNPAID order belonging to the authenticated user. A verified gateway
 * success that races this abort keeps its "never resurrect a cancelled order"
 * handling (ops/refund attention), identical to the unverified-cancel policy
 * already honored in completePayment/processGatewayReturn.
 */
async function abortPayment(userId, { orderId, txnId, reason }) {
  if (!isEnabled()) return { error: 'Worldline payment is not enabled' };
  if (!mongoose.Types.ObjectId.isValid(String(orderId))) return { error: 'Invalid orderId' };

  const payment = await WorldlinePayment.findOne({
    orderId: new mongoose.Types.ObjectId(orderId),
    txnId: String(txnId),
  });
  if (!payment) return { error: 'Payment session not found for order/txnId' };
  if (String(payment.userId) !== String(userId)) return { error: 'Unauthorized' };

  const statusMessage = String(reason || '').trim() || 'Payment cancelled by user';

  // Atomic terminal claim — a real gateway result that already landed wins.
  const claimed = await WorldlinePayment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: ['success', 'failed', 'cancelled'] } },
    {
      $set: {
        status: 'cancelled',
        statusMessage,
        verificationSource: 'client_abort',
      },
    },
    { new: true }
  ).lean();

  const effectivePayment = claimed || (await WorldlinePayment.findById(payment._id).lean());

  if (
    !payment.standaloneCheckout &&
    (effectivePayment.status === 'cancelled' || effectivePayment.status === 'failed')
  ) {
    const order = await Order.findOne({ _id: payment.orderId, userId: new mongoose.Types.ObjectId(userId) }).lean();
    if (order && order.paymentStatus !== 'paid' && order.fulfillmentReleased !== true) {
      try {
        await voidUnpaidOnlineOrder(
          userId,
          String(order._id),
          effectivePayment.statusMessage || statusMessage,
          effectivePayment.status === 'cancelled' ? 'cancelled' : 'failed'
        );
      } catch (e) {
        logger.warn('voidUnpaidOnlineOrder abort failed', { orderId: String(orderId), error: e?.message });
      }
    }
  }

  if (claimed) {
    await notifyWalletTopUpFailure(effectivePayment);
  }

  logger.info('Worldline payment aborted by client', {
    orderId: String(orderId),
    txnId: String(txnId),
    claimed: !!claimed,
    status: effectivePayment.status,
  });

  return {
    data: {
      orderId: String(orderId),
      txnId: String(txnId),
      status: effectivePayment.status,
      statusMessage: effectivePayment.statusMessage,
      purpose: payment.purpose || 'order',
    },
  };
}

async function getStatus(userId, { orderId }) {
  if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
    return { error: 'Invalid orderId' };
  }
  const oid = new mongoose.Types.ObjectId(orderId);
  const userOid = new mongoose.Types.ObjectId(userId);

  const order = await Order.findOne({ _id: oid, userId: userOid }).lean();

  // Wallet top-up / standalone: no CustomerOrder row.
  if (!order) {
    const payments = await WorldlinePayment.find({ orderId: oid, userId: userOid }).sort({
      attemptNo: -1,
    });
    const payment = payments[0];
    if (!payment || (payment.purpose !== 'wallet_topup' && !payment.standaloneCheckout)) {
      return { error: 'Order not found' };
    }

    if (payment.status === 'success' && payment.verificationError === 'none') {
      try {
        await maybeCreditWalletForSuccessfulPayment(payment);
      } catch (e) {
        logger.warn('wallet top-up credit getStatus self-heal failed', {
          orderId: String(orderId),
          error: e?.message,
        });
      }
    }

    let uiState = 'WAITING_FOR_PAYMENT';
    let recommendedAction = 'NONE';
    const isExpired = payment.sessionExpiresAt && new Date() > payment.sessionExpiresAt;

    if (payment.status === 'success' && payment.verificationError === 'none') {
      uiState = 'PAID';
      recommendedAction = 'NONE';
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
    } else if (payment.status === 'failed') {
      uiState = 'FAILED';
      recommendedAction = 'RETRY_PAYMENT';
    } else if (payment.status === 'cancelled') {
      uiState = 'RETRY_AVAILABLE';
      recommendedAction = 'RETRY_PAYMENT';
    }

    return {
      data: {
        orderId: String(orderId),
        orderPaymentStatus:
          payment.status === 'success' && payment.verificationError === 'none' ? 'paid' : 'pending',
        uiState,
        recommendedAction,
        paymentOutcome: resolvePaymentOutcome(payment),
        purpose: payment.purpose || 'order',
        walletCredited: !!payment.walletCredited,
        latestPayment: {
          txnId: payment.txnId,
          attemptNo: payment.attemptNo,
          status: payment.status,
          statusCode: payment.statusCode,
          statusMessage: payment.statusMessage,
          verificationError: payment.verificationError,
          isExpired: !!(payment.sessionExpiresAt && new Date() > payment.sessionExpiresAt),
          updatedAt: payment.updatedAt,
        },
      },
    };
  }

  const payments = await WorldlinePayment.find({ orderId: oid }).sort({ attemptNo: -1 });
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
    } else if (payment.status === 'failed') {
      uiState = 'FAILED';
      recommendedAction = 'RETRY_PAYMENT';
    } else if (payment.status === 'cancelled') {
      uiState = 'RETRY_AVAILABLE';
      recommendedAction = 'RETRY_PAYMENT';
    }
  }

  // Lazy timeout detection: notify once if the active attempt's session expired unpaid.
  if (payment) {
    try {
      await maybeNotifyPaymentTimeout(payment, order);
    } catch (e) {
      logger.warn('payment timeout check failed', { orderId: String(orderId), error: e?.message });
    }
  }

  // Log status checks for debugging
  logger.info('Payment status check', {
    orderId: String(orderId),
    paymentExists: !!payment,
    status: payment?.status,
    uiState,
    verificationError: payment?.verificationError,
    isExpired: payment && payment.sessionExpiresAt && new Date() > payment.sessionExpiresAt,
  });

  if (
    payment &&
    payment.status === 'success' &&
    payment.verificationError === 'none' &&
    order.paymentStatus === 'paid' &&
    order.fulfillmentReleased === false
  ) {
    try {
      await releaseOrderFulfillment(String(orderId));
    } catch (e) {
      logger.warn('releaseOrderFulfillment getStatus self-heal failed', { orderId: String(orderId), error: e?.message });
    }
  }

  return {
    data: {
      orderId: String(orderId),
      orderPaymentStatus: order.paymentStatus,
      uiState,
      recommendedAction,
      paymentOutcome: resolvePaymentOutcome(payment),
      purpose: 'order',
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
            verificationSource: payment.verificationSource,
            tpslTxnId: payment.tpslTxnId,
            bankTxnId: payment.bankTxnId,
          }
        : null,
      allAttempts: payments.map((p) => ({
        txnId: p.txnId,
        attemptNo: p.attemptNo,
        status: p.status,
        statusCode: p.statusCode,
        verificationError: p.verificationError,
        createdAt: p.createdAt,
      })),
    },
  };
}

module.exports = {
  createSession,
  createWalletTopUpSession,
  completePayment,
  abortPayment,
  resolvePaymentContextFromGatewayResponse,
  processGatewayReturn,
  getStatus,
  createStandalonePaymentSession,
  getStandalonePaymentStatus,
  findPaymentByTxnAndOrder,
  mapStatusLabel,
  formatTimeElapsed,
  standaloneInitiateEnabled,
  maybeCreditWalletForSuccessfulPayment,
  maybeNotifyPaymentTimeout,
  resolvePaymentOutcome,
  // exported for tests
  _internals: {
    computeToken,
    computeResponseHash,
    mapStatus,
    isTerminal,
    resolvePaymentOutcome,
    formatWorldlineTxnAmount,
    resolveWorldlineHashAlgo,
    deviceIdForPlatform,
    normalizeWorldlineGatewayPayload,
    parsePipeMsg,
    WORLDLINE_PAYNIMO_MSG_PIPE_ORDER,
    mapStatusLabel,
    formatTimeElapsed,
    resolveWebAppBaseUrl: () => resolveWebAppBaseUrl(logger),
    resolveReturnUrlForPlatform: (platform) => resolveReturnUrlForPlatform(platform, logger),
    resolveWorldlineApiReturnUrl: () => resolveWorldlineApiReturnUrl(logger),
    isLocalOrPrivateHost,
  },
};

