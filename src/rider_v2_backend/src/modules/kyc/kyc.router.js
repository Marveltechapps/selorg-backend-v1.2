"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.kycRouter = void 0;

const express = require("express");
const multer = require("multer");
const { authenticate } = require("../../middleware/authenticate.js");
const kycService = require("./kyc.service.js");
const diditService = require("./didit.service.js");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get("/document-types", async (req, res) => {
  try {
    const list = await kycService.getDocumentTypes();
    return res.json({ documentTypes: list });
  } catch (err) {
    console.error("[KYC] getDocumentTypes:", err);
    return res.status(500).json({ error: "Failed to fetch document types", code: "INTERNAL_ERROR" });
  }
});

router.get("/status", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const statuses = await kycService.getUserStatus(userId);
    return res.json({ documents: statuses });
  } catch (err) {
    console.error("[KYC] getUserStatus:", err);
    return res.status(500).json({ error: "Failed to fetch KYC status", code: "INTERNAL_ERROR" });
  }
});

router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded", code: "MISSING_FILE" });
      }
      const documentTypeCode = req.body.documentTypeCode || req.body.documentType;
      if (!documentTypeCode) {
        return res.status(400).json({ error: "documentTypeCode is required", code: "MISSING_TYPE" });
      }
      const documentNumber = req.body.documentNumber || req.body.number;
      const userId = req.user.id;
      const result = await kycService.upsertUserDocument(
        userId,
        documentTypeCode,
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        documentNumber
      );
      return res.json({
        documentTypeCode: result.documentTypeCode,
        status: result.status,
        uploadedLink: result.uploadedLink || result.fileUrl || null,
        documentNumber: result.documentNumber,
        rejectedReason: result.rejectedReason,
        uploadedAt: result.uploadedAt,
        verifiedAt: result.verifiedAt,
      });
    } catch (err) {
      if (err.message === "Invalid document type") {
        return res.status(400).json({ error: err.message, code: "INVALID_TYPE" });
      }
      if (err.message && err.message.includes("S3")) {
        return res.status(503).json({ error: "Upload service unavailable", code: "S3_ERROR" });
      }
      console.error("[KYC] upload:", err);
      return res.status(500).json({ error: "Upload failed", code: "INTERNAL_ERROR" });
    }
  }
);

// ---------------------------------------------------------------------------
// Didit KYC routes
// ---------------------------------------------------------------------------

/** POST /didit/session – create (or reuse) a Didit verification session for the authenticated rider */
router.post('/didit/session', authenticate, async (req, res) => {
  try {
    const riderId = req.user.id;
    const result = await diditService.createSession(riderId);
    return res.json({
      sessionId: result.sessionId,
      verificationUrl: result.verificationUrl,
      alreadyVerified: result.alreadyVerified,
    });
  } catch (err) {
    console.error('[KYC] didit/session:', err);
    return res.status(500).json({ error: err.message || 'Failed to create Didit session', code: 'DIDIT_SESSION_ERROR' });
  }
});

/** GET /didit/status – poll latest Didit KYC status for the authenticated rider */
router.get('/didit/status', authenticate, async (req, res) => {
  try {
    const riderId = req.user.id;
    const result = await diditService.getSessionStatus(riderId);
    return res.json(result);
  } catch (err) {
    console.error('[KYC] didit/status:', err);
    return res.status(500).json({ error: 'Failed to fetch Didit status', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /didit/webhook – receive Didit completion callbacks.
 * Didit sends JSON with X-Signature header (HMAC-SHA256).
 * This route must remain unauthenticated (called by Didit servers).
 */
router.post('/didit/webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-signature'] || req.headers['x-didit-signature'] || '';
    const result = await diditService.processWebhook(req.body, signature);
    if (!result.ok && result.reason === 'invalid_signature') {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('[KYC] didit/webhook:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

exports.kycRouter = router;
