'use strict';

/**
 * Didit identity-verification service (picker backend)
 *
 * Mirrors the rider didit.service.js but updates the picker Document model
 * and uses userType='picker' in vendor_data.
 *
 * Required env vars:
 *   DIDIT_API_KEY (or DIDIT_CLIENT_SECRET) – Didit application API key (x-api-key header)
 *   DIDIT_WEBHOOK_SECRET – HMAC secret for webhook signature verification
 *   DIDIT_WEBHOOK_BASE_URL – Public server origin only (e.g. https://api.selorg.com)
 * Optional:
 *   DIDIT_WORKFLOW_ID – v3 workflow UUID (defaults to Custom KYC workflow)
 * Legacy OAuth (optional, deprecated by Didit):
 *   DIDIT_CLIENT_ID + DIDIT_CLIENT_SECRET
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Document = require('../models/document.model');

/** Default "Custom KYC" workflow (OCR + LIVENESS + FACE_MATCH) on the Selorg Didit app. */
const DEFAULT_WORKFLOW_ID = 'c2c00127-641c-4f9a-bf3b-b152ed110c04';

// ---------------------------------------------------------------------------
// Didit session model (picker-scoped to avoid collection conflict with rider)
// ---------------------------------------------------------------------------

const DiditKycSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userType: { type: String, enum: ['rider', 'picker'], default: 'picker' },
    sessionId: { type: String, required: true, unique: true },
    verificationUrl: { type: String },
    status: {
      type: String,
      enum: ['created', 'pending', 'APPROVED', 'DECLINED', 'REVIEW', 'EXPIRED'],
      default: 'created',
    },
    webhookPayload: mongoose.Schema.Types.Mixed,
    completedAt: Date,
  },
  { timestamps: true }
);

const DiditKycSession =
  mongoose.models.PickerDigitKycSession ||
  mongoose.model('PickerDigitKycSession', DiditKycSessionSchema, 'picker_didit_kyc_sessions');

// ---------------------------------------------------------------------------
// Didit API client (token cache is process-scoped; shared if rider + picker
// run in the same process — that's fine, same credentials)
// ---------------------------------------------------------------------------

const DIDIT_AUTH_URL = 'https://auth.didit.me/oauth/token';
const DIDIT_BASE_URL = 'https://verification.didit.me';

let _cachedToken = null;
let _tokenExpiresAt = 0;

function getApiKey() {
  return (process.env.DIDIT_API_KEY || process.env.DIDIT_CLIENT_SECRET || '').trim();
}

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && _tokenExpiresAt > now + 30_000) return _cachedToken;

  const clientId = (process.env.DIDIT_CLIENT_ID || '').trim();
  const clientSecret = (process.env.DIDIT_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('DIDIT_CLIENT_ID and DIDIT_CLIENT_SECRET must be set for OAuth (use DIDIT_API_KEY instead)');
  }

  const res = await fetch(DIDIT_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Didit OAuth failed (${res.status}): ${data.error ?? 'unknown'}`);
  }

  _cachedToken = data.access_token;
  _tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000;
  return _cachedToken;
}

/**
 * Create a Didit verification session via v3 (x-api-key) or legacy v1/OAuth.
 */
async function requestDiditSession({ vendorData, callbackUrl }) {
  const apiKey = getApiKey();
  const workflowId = (process.env.DIDIT_WORKFLOW_ID || DEFAULT_WORKFLOW_ID).trim();

  if (apiKey) {
    const res = await fetch(`${DIDIT_BASE_URL}/v3/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: vendorData,
        callback: callbackUrl,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        data.error ??
        data.message ??
        (typeof data === 'object' ? JSON.stringify(data) : 'unknown');
      throw new Error(`Didit createSession failed (${res.status}): ${detail}`);
    }
    return data;
  }

  const token = await getAccessToken();
  const res = await fetch(`${DIDIT_BASE_URL}/v1/session/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      callback: callbackUrl,
      vendor_data: vendorData,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Didit createSession failed (${res.status}): ${data.error ?? data.message ?? 'unknown'}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

async function createSession(pickerId) {
  // Idempotency: if already approved, return immediately
  const existing = await DiditKycSession.findOne({
    userId: String(pickerId),
    userType: 'picker',
    status: 'APPROVED',
  }).lean();
  if (existing) {
    return { sessionId: existing.sessionId, verificationUrl: existing.verificationUrl, alreadyVerified: true };
  }

  const webhookBaseUrl = (process.env.DIDIT_WEBHOOK_BASE_URL || '').replace(/\/$/, '');
  if (!webhookBaseUrl) {
    throw new Error('DIDIT_WEBHOOK_BASE_URL must be set (e.g. https://api.selorg.com)');
  }
  const callbackUrl = `${webhookBaseUrl}/api/v1/picker/didit/webhook`;

  if (!getApiKey() && !(process.env.DIDIT_CLIENT_ID || '').trim()) {
    throw new Error('Didit is not configured. Set DIDIT_API_KEY (or DIDIT_CLIENT_SECRET) in the backend .env');
  }

  const data = await requestDiditSession({
    vendorData: `picker:${pickerId}`,
    callbackUrl,
  });

  const sessionId = data.session_id;
  const verificationUrl = data.url;

  await DiditKycSession.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        userId: String(pickerId),
        userType: 'picker',
        sessionId,
        verificationUrl,
        status: 'created',
      },
    },
    { upsert: true, new: true }
  );

  console.log(`[Didit] Session created for picker ${pickerId}: ${sessionId}`);
  return { sessionId, verificationUrl, alreadyVerified: false };
}

// ---------------------------------------------------------------------------
// Status polling
// ---------------------------------------------------------------------------

async function getSessionStatus(pickerId) {
  const session = await DiditKycSession.findOne({ userId: String(pickerId), userType: 'picker' })
    .sort({ createdAt: -1 })
    .lean();
  if (!session) return { status: 'not_started', sessionId: null };
  return { status: session.status, sessionId: session.sessionId };
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

function verifySignature(bodyJson, signatureHeader) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[Didit] DIDIT_WEBHOOK_SECRET not set – skipping signature check (dev only)');
    return true;
  }
  if (!signatureHeader) return false;

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(bodyJson).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Process a Didit webhook for a picker.
 * Updates all picker documents (aadhar front+back, pan front+back) to the new status.
 */
async function processWebhook(payload, signatureHeader) {
  const bodyJson = JSON.stringify(payload);
  if (!verifySignature(bodyJson, signatureHeader)) {
    console.warn('[Didit] Picker webhook signature mismatch – rejecting');
    return { ok: false, reason: 'invalid_signature' };
  }

  const { session_id: sessionId, status, features_status, vendor_data } = payload;
  if (!sessionId || !vendor_data) return { ok: false, reason: 'missing_fields' };

  const [userType, userId] = (vendor_data || '').split(':');
  if (userType !== 'picker') return { ok: true, reason: 'not_picker' };

  console.log(`[Didit] Webhook for picker ${userId}: session=${sessionId} status=${status}`);

  await DiditKycSession.findOneAndUpdate(
    { sessionId },
    { $set: { status, webhookPayload: payload, completedAt: new Date() } },
    { upsert: true }
  );

  const docStatus =
    status === 'APPROVED' ? 'approved' : status === 'DECLINED' ? 'rejected' : 'pending';
  const rejectionReason =
    status === 'DECLINED'
      ? features_status?.ocr?.decline_reason ||
        features_status?.face_id?.decline_reason ||
        'Verification declined by Didit'
      : null;

  // Update every aadhar + pan side for this picker
  const updateFields = {
    status: docStatus,
    rejectionReason,
    reviewedAt: new Date(),
    reviewedBy: null,
  };

  await Document.updateMany(
    { userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId },
    { $set: updateFields }
  );

  console.log(`[Didit] Picker ${userId} documents updated to ${docStatus}`);
  return { ok: true };
}

module.exports = { createSession, getSessionStatus, processWebhook };
