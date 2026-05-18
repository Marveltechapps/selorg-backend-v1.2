/**
 * Picker KYC (Know Your Customer) Routes
 * File: src/routes/api/v1/picker/kyc.routes.js
 *
 * P2.1: Picker KYC verification (P0.1 webhook integration)
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');

/**
 * GET /api/v1/picker/kyc/status
 * Get KYC verification status
 */
router.get('/status', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const data = {
      kycStatus: {
        userId: req.user.userId,
        status: 'VERIFIED',
        verifiedAt: '2026-04-15T10:00:00Z',
        documentsSubmitted: ['ID', 'SELFIE'],
        expiryDate: '2027-04-15',
      },
    };
    res.status(200).json(ResponseFormatter.success(data, 'KYC status'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/picker/kyc/initiate
 * Initiate KYC verification
 */
router.post('/initiate', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const { documentType } = req.body;

    if (!documentType) {
      return res
        .status(422)
        .json(
          ResponseFormatter.validationError([{ field: 'documentType', message: 'Document type required' }])
        );
    }

    const data = {
      verificationUrl: 'https://kyc.provider.com/verify/abc123',
      sessionId: 'session_kyc_123',
    };
    res.status(200).json(ResponseFormatter.success(data, 'KYC session created'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/picker/kyc/webhook
 * KYC provider webhook (P0.1 - receives KYC status updates)
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const { userId, status } = req.body;

    if (!userId || !status) {
      return res
        .status(422)
        .json(
          ResponseFormatter.validationError([
            { field: 'userId', message: 'userId and status required' },
            { field: 'status', message: 'userId and status required' },
          ])
        );
    }

    res
      .status(200)
      .json(ResponseFormatter.success({ webhookId: `webhook_kyc_${Date.now()}` }, 'Webhook received'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
