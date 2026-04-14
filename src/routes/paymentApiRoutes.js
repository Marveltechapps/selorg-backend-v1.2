const express = require('express');
const auth = require('../customer-backend/middleware/auth');
const logger = require('../core/utils/logger');
const {
  createStandalonePaymentSession,
  processGatewayReturn,
  getStandalonePaymentStatus,
} = require('../customer-backend/services/worldlinePaymentsService');
const { getTransactionStatusPostTxn } = require('../customer-backend/controllers/worldlinePaymentsController');

const router = express.Router();

/**
 * POST /api/payment/initiate
 * Auth: Bearer JWT (same as customer app — `customer-backend/middleware/auth.js`, secret CUSTOMER_JWT_SECRET or JWT_SECRET).
 * Body: { orderId, amount, customerName?, customerEmail, customerPhone, platform?, algo?, paymentMode? }
 */
router.post('/initiate', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const {
      orderId: clientOrderId,
      amount,
      customerEmail,
      customerPhone,
      platform = 'android',
      algo,
      paymentMode,
    } = body;

    if (clientOrderId == null || clientOrderId === '') {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }
    if (amount == null || Number.isNaN(Number(amount))) {
      return res.status(400).json({ success: false, message: 'amount is required' });
    }
    if (!customerEmail && !customerPhone) {
      return res.status(400).json({ success: false, message: 'customerEmail or customerPhone is required' });
    }

    const result = await createStandalonePaymentSession({
      userId: req.user._id,
      externalOrderRef: String(clientOrderId),
      amountInr: Number(amount),
      consumerEmailId: customerEmail ? String(customerEmail).trim() : '',
      consumerMobileNo: customerPhone ? String(customerPhone).trim() : '',
      platform,
      algo,
      paymentMode,
    });

    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
      meta: {
        clientOrderRef: result.data.clientOrderRef,
        note:
          'Poll GET /api/payment/status/:orderId with the same Bearer token. ' +
          'POST /api/payment/callback requires the same JWT and verifies the session belongs to you. ' +
          'Browser redirect from Worldline (no JWT) should use GET/POST /api/v1/customer/payments/worldline/return.',
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('payment initiate error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * POST /api/payment/callback — app/SDK posts gateway payload with Bearer JWT; ownership checked vs payment.userId.
 * (Gateway browser return without JWT: use /api/v1/customer/payments/worldline/return.)
 */
router.post('/callback', auth, async (req, res) => {
  try {
    const body = req.body || {};
    let bodyJson = '';
    try {
      bodyJson = JSON.stringify(body);
    } catch (e) {
      bodyJson = `[stringify failed: ${e?.message || e}]`;
    }
    const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    const hasMsgKey = Object.prototype.hasOwnProperty.call(body, 'msg');
    const msgIsString = typeof body.msg === 'string';
    const msgLooksLikeJson =
      msgIsString && String(body.msg).trimStart().startsWith('{');

    let mergedQueryBody = '';
    try {
      mergedQueryBody = JSON.stringify({ ...(req.query || {}), ...body });
    } catch (e) {
      mergedQueryBody = `[stringify failed: ${e?.message || e}]`;
    }

    let rawBodyString = '';
    try {
      rawBodyString = JSON.stringify({ query: req.query || {}, body });
    } catch (e) {
      rawBodyString = `[stringify failed: ${e?.message || e}]`;
    }
    logger.info('POST /api/payment/callback raw request (query + body)', {
      contentType: req.headers['content-type'],
      fullReqBodyJson: bodyJson,
      bodyKeys,
      hasMsgKey,
      msgIsString,
      msgLooksLikeJson,
      mergedQueryBody,
      rawBodyJson: rawBodyString,
      queryKeys: req.query && typeof req.query === 'object' ? Object.keys(req.query) : [],
    });

    const merged = { ...(req.query || {}), ...(req.body || {}) };
    const result = await processGatewayReturn({ response: merged, allowedUserId: req.user._id });
    if (result.error === 'Unauthorized') {
      return res.status(403).json({ success: false, message: result.error });
    }
    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
        ...(result.data ? { data: result.data } : {}),
      });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('payment callback error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/payment/status/:orderId — scoped to authenticated user */
router.get('/status/:orderId', auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const result = await getStandalonePaymentStatus(orderId, req.user._id);
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('payment status error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/payment/transaction-status — Type O post-transaction reconciliation lookup */
router.post('/transaction-status', getTransactionStatusPostTxn);

module.exports = router;
