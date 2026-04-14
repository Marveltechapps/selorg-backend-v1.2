const {
  createSession,
  completePayment,
  getStatus,
  processGatewayReturn,
  findPaymentByTxnAndOrder,
  mapStatusLabel,
  formatTimeElapsed,
} = require('../services/worldlinePaymentsService');
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

async function createWorldlineSession(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, platform, algo, consumerEmailId, consumerMobileNo, paymentMode } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    if (!platform) return res.status(400).json({ success: false, message: 'platform is required (android|ios)' });

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
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    if (!txnId) return res.status(400).json({ success: false, message: 'txnId is required' });
    if (!response || typeof response !== 'object') {
      return res.status(400).json({ success: false, message: 'response object is required' });
    }

    // Log SDK response for LM Group support
    console.log('\n========================================');
    console.log('WORLDLINE COMPLETE PAYMENT REQUEST');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('User ID:', userId);
    console.log('Order ID:', orderId);
    console.log('Transaction ID:', txnId);
    console.log('SDK Response:', JSON.stringify(response, null, 2));
    if (clientDebug) console.log('SDK Debug:', JSON.stringify(clientDebug, null, 2));
    console.log('========================================\n');

    const result = await completePayment(userId, { orderId, txnId, response, clientDebug });
    
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
    const result = await processGatewayReturn({ response });

    // Always return 200 to avoid gateway retries; embed success flag in payload.
    if (result.error) {
      return res.status(200).send(
        `<html><body><h3>Payment processing</h3><p>${String(result.error)}</p></body></html>`
      );
    }

    return res.status(200).send(
      `<html><body><h3>Payment processed</h3><p>Status: ${String(result.data.status)}</p></body></html>`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('worldline return error:', err);
    return res.status(200).send('<html><body><h3>Payment processing</h3><p>Internal error</p></body></html>');
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
  getWorldlineStatus,
  worldlineReturn,
  getTransactionStatusPostTxn,
};

