'use strict';

const diditService = require('../services/didit.service');

/** POST /didit/session – create (or reuse) a Didit verification session */
const createSession = async (req, res, next) => {
  try {
    const pickerId = req.userId;
    if (!pickerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const result = await diditService.createSession(pickerId);
    return res.json({
      success: true,
      sessionId: result.sessionId,
      verificationUrl: result.verificationUrl,
      alreadyVerified: result.alreadyVerified,
    });
  } catch (err) {
    console.error('[Didit] createSession controller:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create Didit session' });
  }
};

/** GET /didit/status – poll latest Didit status for this picker */
const getStatus = async (req, res, next) => {
  try {
    const pickerId = req.userId;
    if (!pickerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const result = await diditService.getSessionStatus(pickerId);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /didit/webhook – unauthenticated; called by Didit servers.
 * Validates signature, then updates picker document statuses.
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-signature'] || req.headers['x-didit-signature'] || '';
    const result = await diditService.processWebhook(req.body, signature);

    if (!result.ok && result.reason === 'invalid_signature') {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('[Didit] webhook controller:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

module.exports = { createSession, getStatus, handleWebhook };
