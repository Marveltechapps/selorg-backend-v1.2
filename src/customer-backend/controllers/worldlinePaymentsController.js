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

    const { orderId, txnId, response } = req.body || {};
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
    console.log('========================================\n');

    const result = await completePayment(userId, { orderId, txnId, response });
    
    if (result.error) {
      console.log('\n========================================');
      console.log('WORLDLINE COMPLETE PAYMENT ERROR');
      console.log('========================================');
      console.log('Error:', result.error);
      console.log('========================================\n');
      return res.status(400).json({ success: false, message: result.error });
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

module.exports = { createWorldlineSession, completeWorldlinePayment, getWorldlineStatus, worldlineReturn };

