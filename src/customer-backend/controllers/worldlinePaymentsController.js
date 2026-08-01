const {
  createSession,
  completePayment,
  abortPayment,
  getStatus,
  processGatewayReturn,
  resolvePaymentContextFromGatewayResponse,
  findPaymentByTxnAndOrder,
  mapStatusLabel,
  formatTimeElapsed,
} = require('../services/worldlinePaymentsService');
const { resolveWebAppBaseUrl } = require('../utils/paymentRedirectUrls');
const logger = require('../../core/utils/logger');

function isValidIso8601(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && value.includes('T');
}

function formatAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(2);
}

function resolveWorldlineResponseStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'success') return 'success';
  if (
    key === 'cancelled' ||
    key === 'canceled' ||
    key === 'cancel' ||
    key === 'user_cancelled' ||
    key === 'user_canceled' ||
    key === 'aborted' ||
    key === 'abort' ||
    key === '0392' ||
    key === '0002'
  ) {
    return 'cancelled';
  }
  // Unverified/ambiguous outcomes stay "pending" so the app re-verifies with the
  // backend instead of announcing a failure (or worse, a success) it cannot prove.
  if (key === 'pending' || key === '0398' || key === '0396' || key === 'unknown') return 'pending';
  if (key === 'timeout' || key === 'error') return 'failed';
  return 'failed';
}

/**
 * Presentation for the browser redirect after the gateway return.
 * The redirect status is a UI hint only — the web app re-verifies against
 * GET /payments/worldline/status before showing success. Success is therefore
 * ONLY derived from the server-verified result (`resultStatus`), never from the
 * raw gateway query string, which is attacker-controllable.
 */
function inferWorldlineReturnPresentation(response, resultStatus, errorMessage) {
  const merged = response && typeof response === 'object' ? response : {};
  const err = String(errorMessage || '').trim();

  // Server processed and verified the return — trust that result.
  if (resultStatus) {
    const resolved = resolveWorldlineResponseStatus(resultStatus);
    if (resolved === 'success') return { status: 'success', message: '' };
    if (resolved === 'cancelled') {
      return {
        status: 'cancelled',
        message: 'You cancelled the payment. No amount has been charged.',
      };
    }
    if (resolved === 'pending') {
      return { status: 'pending', message: 'Your payment is being verified.' };
    }
    return { status: 'failed', message: err };
  }

  // Processing failed (no verified result). Classify conservatively — never success.
  const txnStatus = String(
    merged.txn_status || merged.statusCode || merged.TXN_STATUS || merged.status || ''
  )
    .trim()
    .toLowerCase();

  if (txnStatus === '0392' || txnStatus === '0002' || txnStatus === 'cancelled' || txnStatus === 'cancel') {
    return {
      status: 'cancelled',
      message: 'You cancelled the payment. No amount has been charged.',
    };
  }

  const errLower = err.toLowerCase();
  if (
    errLower.includes('cancel') ||
    errLower.includes('0392') ||
    errLower.includes('missing clnt_txn_ref') ||
    errLower.includes('missing txnid') ||
    Object.keys(merged).length === 0
  ) {
    return {
      status: 'cancelled',
      message: 'You cancelled the payment. No amount has been charged.',
    };
  }

  if (txnStatus === '0300' || txnStatus === 'success' || txnStatus === '0398' || txnStatus === '0396') {
    // Gateway claims success/pending but the server could not verify it —
    // present as pending so the app polls the verified status.
    return { status: 'pending', message: 'Your payment is being verified.' };
  }

  return { status: 'failed', message: err };
}

function buildPaymentResultRedirectUrl({ status, message, orderId, txnId, amount, purpose }) {
  const base = resolveWebAppBaseUrl(logger);
  // Wallet top-ups return to the wallet tab; grocery checkout stays on /payment.
  const path = purpose === 'wallet_topup' ? '/account/wallet' : '/payment';
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('paynimo_bridge', '1');
  const resolvedStatus = resolveWorldlineResponseStatus(status);
  url.searchParams.set('status', resolvedStatus);
  if (orderId) url.searchParams.set('orderId', String(orderId));
  if (txnId) url.searchParams.set('txnId', String(txnId));
  if (amount != null && String(amount).trim() !== '') {
    url.searchParams.set('amount', String(amount));
  }
  if (purpose) url.searchParams.set('purpose', String(purpose));
  if (message) url.searchParams.set('message', String(message).slice(0, 500));
  return url.toString();
}

function redirectToPaymentResultPage(res, payload) {
  const redirectUrl = buildPaymentResultRedirectUrl(payload);
  const webAppBase = resolveWebAppBaseUrl(logger);

  logger.info('WORLDLINE_RETURN_REDIRECT', {
    event: 'worldline_return_redirect',
    status: payload.status,
    orderId: payload.orderId || '',
    txnId: payload.txnId || '',
    redirectUrl,
    webAppBase,
    webAppEnv: process.env.WORLDLINE_WEB_APP_URL || process.env.CUSTOMER_WEB_URL || process.env.FRONTEND_URL || null,
  });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Selorg-Payment-Return', 'redirect-v2');
  res.setHeader('X-Selorg-Redirect-Target', redirectUrl);
  return res.redirect(302, redirectUrl);
}

async function createWorldlineSession(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, platform, algo, consumerEmailId, consumerMobileNo, paymentMode } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    if (!platform) return res.status(400).json({ success: false, message: 'platform is required (android|ios|web)' });

    // Log request for LM Group support
    console.log('\n========================================');
    console.log('WORLDLINE SESSION REQUEST');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('User ID:', userId);
    console.log('Order ID:', orderId);
    console.log('Platform:', platform);
    console.log('Payment Mode:', paymentMode);
    console.log('Consumer Email:', consumerEmailId);
    console.log('Consumer Mobile:', consumerMobileNo);
    console.log('========================================\n');

    const result = await createSession(userId, { orderId, platform, algo, consumerEmailId, consumerMobileNo, paymentMode });
    
    if (result.error) {
      console.log('\n========================================');
      console.log('WORLDLINE SESSION ERROR');
      console.log('========================================');
      console.log('Error:', result.error);
      console.log('========================================\n');
      return res.status(400).json({ success: false, message: result.error });
    }

    // Log response for LM Group support
    console.log('\n========================================');
    console.log('WORLDLINE SESSION RESPONSE');
    console.log('========================================');
    console.log('Merchant ID:', result.data?.sessionPayload?.consumerData?.merchantId);
    console.log('Transaction ID:', result.data?.txnId);
    console.log('Attempt Number:', result.data?.attemptNo);
    console.log('Total Amount:', result.data?.sessionPayload?.consumerData?.totalAmount);
    console.log('Payment Mode:', result.data?.sessionPayload?.consumerData?.paymentMode);
    console.log('Device ID:', result.data?.sessionPayload?.consumerData?.deviceId);
    console.log('Token Length:', result.data?.sessionPayload?.consumerData?.token?.length);
    console.log('========================================\n');

    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('\n========================================');
    console.error('WORLDLINE SESSION EXCEPTION');
    console.error('========================================');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    console.error('========================================\n');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function completeWorldlinePayment(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, txnId, response, debug: clientDebug } = req.body || {};
    if (!response || typeof response !== 'object') {
      return res.status(400).json({ success: false, message: 'response object is required' });
    }

    let resolvedOrderId = orderId != null ? String(orderId).trim() : '';
    let resolvedTxnId = txnId != null ? String(txnId).trim() : '';

    if (!resolvedOrderId || !resolvedTxnId) {
      const ctx = await resolvePaymentContextFromGatewayResponse(userId, response);
      if (ctx.error) {
        return res.status(400).json({ success: false, message: ctx.error });
      }
      resolvedOrderId = resolvedOrderId || ctx.orderId;
      resolvedTxnId = resolvedTxnId || ctx.txnId;
    }

    if (!resolvedOrderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    if (!resolvedTxnId) return res.status(400).json({ success: false, message: 'txnId is required' });

    // Log SDK response for LM Group support
    console.log('\n========================================');
    console.log('WORLDLINE COMPLETE PAYMENT REQUEST');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('User ID:', userId);
    console.log('Order ID:', resolvedOrderId);
    console.log('Transaction ID:', resolvedTxnId);
    console.log('SDK Response:', JSON.stringify(response, null, 2));
    if (clientDebug) console.log('SDK Debug:', JSON.stringify(clientDebug, null, 2));
    console.log('========================================\n');

    const result = await completePayment(userId, {
      orderId: resolvedOrderId,
      txnId: resolvedTxnId,
      response,
      clientDebug,
    });
    
    if (result.error) {
      console.log('\n========================================');
      console.log('WORLDLINE COMPLETE PAYMENT ERROR');
      console.log('========================================');
      console.log('Error:', result.error);
      console.log('========================================\n');
      return res.status(400).json({
        success: false,
        message: result.error,
        ...(result.data ? { data: result.data } : {}),
      });
    }

    // Log completion result
    console.log('\n========================================');
    console.log('WORLDLINE COMPLETE PAYMENT RESPONSE');
    console.log('========================================');
    console.log('Status:', result.data?.status);
    console.log('Payment Status:', result.data?.paymentStatus);
    console.log('========================================\n');

    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('\n========================================');
    console.error('WORLDLINE COMPLETE PAYMENT EXCEPTION');
    console.error('========================================');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    console.error('========================================\n');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/**
 * Customer aborted checkout without a gateway payload (window closed / browser
 * back). Marks the attempt cancelled and voids the unpaid order so the single
 * "Payment Cancelled" notification is sent immediately.
 */
async function abortWorldlinePayment(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, txnId, reason } = req.body || {};
    if (!orderId || !txnId) {
      return res.status(400).json({ success: false, message: 'orderId and txnId are required' });
    }

    const result = await abortPayment(userId, {
      orderId: String(orderId).trim(),
      txnId: String(txnId).trim(),
      reason,
    });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    logger.error('worldline abort error', { error: err?.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getWorldlineStatus(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const orderId = req.query.orderId;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId query param is required' });

    const result = await getStatus(userId, { orderId });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('worldline status error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function worldlineReturn(req, res) {
  try {
    // Gateway can send either query params or form/json body.
    const response = { ...(req.query || {}), ...(req.body || {}) };

    logger.info('WORLDLINE_RETURN_RECEIVED', {
      event: 'worldline_return_received',
      method: req.method,
      contentType: req.headers['content-type'] || '',
      queryKeys: Object.keys(req.query || {}),
      bodyKeys: Object.keys(req.body || {}),
    });

    const result = await processGatewayReturn({ response });
    const gatewayAmount =
      response?.txn_amt ??
      response?.txnAmount ??
      response?.amount ??
      result.data?.amountInr ??
      '';

    // Always redirect to the customer web app (never expose raw API HTML to users).
    if (result.error) {
      const presentation = inferWorldlineReturnPresentation(response, null, result.error);
      return redirectToPaymentResultPage(res, {
        status: presentation.status,
        message: presentation.message || String(result.error),
        orderId: result.data?.orderId,
        txnId: result.data?.txnId,
        amount: gatewayAmount,
        purpose: result.data?.purpose,
      });
    }

    const presentation = inferWorldlineReturnPresentation(
      response,
      result.data.status,
      result.data.statusMessage
    );

    return redirectToPaymentResultPage(res, {
      status: presentation.status,
      message: presentation.message || result.data.statusMessage,
      orderId: result.data.orderId,
      txnId: result.data.txnId,
      amount: gatewayAmount || result.data.amountInr,
      purpose: result.data.purpose,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('worldline return error:', err);
    return redirectToPaymentResultPage(res, {
      status: 'failed',
      message: 'We could not confirm your payment status right now. Please try again.',
    });
  }
}

async function getTransactionStatusPostTxn(req, res) {
  const startedAt = Date.now();
  const {
    merchantId,
    txnId,
    orderId,
    txnAmount,
    requestType,
    queryTimestamp,
  } = req.body || {};

  logger.info('Type O status query received', {
    txnId: String(txnId || ''),
    orderId: String(orderId || ''),
    requestType: String(requestType || ''),
    requestTimestamp: new Date().toISOString(),
  });

  const expectedMerchantId = String(
    process.env.WORLDLINE_MERCHANT_ID || process.env.WORLDLINE_MERCHANT_CODE || ''
  ).trim();
  const merchantMatches = String(merchantId || '').trim() !== '' && String(merchantId).trim() === expectedMerchantId;
  const requiredFieldsPresent =
    String(merchantId || '').trim() !== '' &&
    String(txnId || '').trim() !== '' &&
    String(orderId || '').trim() !== '' &&
    String(requestType || '').trim() !== '' &&
    isValidIso8601(String(queryTimestamp || ''));

  logger.info('Type O request validation', {
    requestTypeValid: requestType === 'O',
    requiredFieldsPresent,
    merchantIdMatches: merchantMatches,
  });

  if (requestType !== 'O') {
    return res.status(400).json({
      success: false,
      requestType: 'O',
      error: 'INVALID_REQUEST_TYPE',
      message: "requestType must be 'O' for this endpoint",
      data: null,
    });
  }

  if (!requiredFieldsPresent) {
    return res.status(400).json({
      success: false,
      requestType: 'O',
      error: 'MISSING_REQUIRED_FIELDS',
      message: 'merchantId, txnId, orderId, requestType, and valid queryTimestamp are required',
      data: null,
    });
  }

  if (!merchantMatches) {
    return res.status(400).json({
      success: false,
      requestType: 'O',
      error: 'INVALID_MERCHANT_ID',
      message: 'merchantId does not match configured merchant',
      data: null,
    });
  }

  const queryTimestampDate = new Date(String(queryTimestamp));
  if (queryTimestampDate.getTime() > Date.now()) {
    logger.warn('Type O query timestamp in future; using current server time for response', {
      txnId: String(txnId),
      orderId: String(orderId),
      queryTimestamp: queryTimestampDate.toISOString(),
    });
  }

  try {
    const payment = await findPaymentByTxnAndOrder(txnId, orderId, txnAmount);
    logger.info('Type O database lookup', {
      txnId: String(txnId),
      orderId: String(orderId),
      found: !!payment,
      statusIfFound: payment?.statusCode || '',
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        requestType: 'O',
        error: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found in database',
        data: {
          txnId: String(txnId),
          orderId: String(orderId),
        },
      });
    }

    if (payment._amountMismatch) {
      return res.status(400).json({
        success: false,
        requestType: 'O',
        error: 'AMOUNT_MISMATCH',
        message: 'Requested amount does not match stored transaction amount',
        data: {
          requestedAmount: payment._requestedAmount,
          storedAmount: payment._storedAmount,
        },
      });
    }

    const queryTime = new Date();
    const txnTimeSource = payment.tpslTxnTime || payment.updatedAt || payment.createdAt;
    const txnDate = txnTimeSource ? new Date(txnTimeSource) : null;
    const safeTxnDate = txnDate && Number.isFinite(txnDate.getTime()) ? txnDate : new Date(payment.createdAt || Date.now());
    const elapsedSeconds = Math.max(0, Math.floor((queryTime.getTime() - safeTxnDate.getTime()) / 1000));
    const elapsedFormatted = formatTimeElapsed(elapsedSeconds);

    logger.info('Type O time elapsed calculation', {
      txnTime: safeTxnDate.toISOString(),
      queryTime: queryTime.toISOString(),
      elapsedSeconds,
      elapsedFormatted,
    });

    const statusCode = String(payment.statusCode || '').trim();
    const statusLabel = mapStatusLabel(statusCode);
    const responsePayload = {
      success: true,
      requestType: 'O',
      data: {
        orderId: String(payment.orderId),
        txnId: String(payment.txnId || txnId),
        clntTxnRef: String(payment.txnId || txnId),
        status: String(payment.status || 'unknown'),
        statusCode,
        statusLabel,
        tpslTxnId: String(payment.tpslTxnId || ''),
        txnAmount: formatAmount(payment.amountInr) || String(txnAmount || ''),
        txnTime: safeTxnDate.toISOString(),
        queryTime: queryTime.toISOString(),
        timeElapsed: elapsedFormatted,
        verificationStatus: payment.verificationError === 'none' ? 'verified' : 'unverified',
        hashVerified: payment.verificationError === 'none',
        source: 'callback_database',
      },
      message: `Transaction status confirmed after ${elapsedFormatted}`,
    };

    logger.info('Type O response sent', {
      txnId: String(payment.txnId || txnId),
      statusCode,
      statusLabel,
      httpStatus: 200,
      responseTime: `${Date.now() - startedAt}ms`,
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    logger.error('Type O status query failed', {
      txnId: String(txnId || ''),
      orderId: String(orderId || ''),
      error: error?.message || String(error),
    });
    return res.status(500).json({
      success: false,
      requestType: 'O',
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Unable to fetch transaction status',
      data: null,
    });
  }
}

module.exports = {
  createWorldlineSession,
  completeWorldlinePayment,
  abortWorldlinePayment,
  getWorldlineStatus,
  worldlineReturn,
  getTransactionStatusPostTxn,
  getPaymentRetryStatus: require('./paymentRetryController').getPaymentRetryStatus,
  retryPayment: require('./paymentRetryController').retryPayment,
};

