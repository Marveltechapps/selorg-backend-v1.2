const {
  createSession,
  completePayment,
  getStatus,
  processGatewayReturn,
} = require('../services/worldlinePaymentsService');

async function createWorldlineSession(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, platform, algo, consumerEmailId, consumerMobileNo } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    if (!platform) return res.status(400).json({ success: false, message: 'platform is required (android|ios)' });

    const result = await createSession(userId, { orderId, platform, algo, consumerEmailId, consumerMobileNo });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('worldline create session error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function completeWorldlinePayment(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, txnId, response } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    if (!txnId) return res.status(400).json({ success: false, message: 'txnId is required' });
    if (!response || typeof response !== 'object') {
      return res.status(400).json({ success: false, message: 'response object is required' });
    }

    const result = await completePayment(userId, { orderId, txnId, response });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('worldline complete payment error:', err);
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

module.exports = { createWorldlineSession, completeWorldlinePayment, getWorldlineStatus, worldlineReturn };

