'use strict';

/**
 * Didit identity-verification service (rider backend)
 *
 * Didit flow:
 *  1. Call createSession() → get session_id + url
 *  2. App opens url (Didit captures docs + live face internally)
 *  3. Didit calls our webhook on completion
 *  4. processWebhook() maps result → rider KYC status
 *
 * Required env vars:
 *   DIDIT_CLIENT_ID          – OAuth2 client id from Didit dashboard
 *   DIDIT_CLIENT_SECRET      – OAuth2 client secret
 *   DIDIT_WEBHOOK_SECRET     – Shared secret for HMAC-SHA256 signature verification
 *   DIDIT_WEBHOOK_BASE_URL   – Publicly reachable base URL of this server (e.g. https://api.selorg.in)
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { Rider } = require('../../models/Rider.js');

// ---------------------------------------------------------------------------
// Didit session model (stored alongside rider data so we can look up by sessionId)
// ---------------------------------------------------------------------------

const DiditKycSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userType: { type: String, enum: ['rider', 'picker'], default: 'rider' },
    sessionId: { type: String, required: true, unique: true },
    verificationUrl: { type: String },
    status: {
      type: String,
      enum: ['created', 'pending', 'APPROVED', 'DECLINED', 'REVIEW', 'EXPIRED'],
      default: 'created',
    },
    features: { type: String, default: 'OCR + FACE_ID' },
    webhookPayload: mongoose.Schema.Types.Mixed,
    completedAt: Date,
  },
  { timestamps: true }
);

// Guard against model re-registration (hot-reload in dev)
const DiditKycSession =
  mongoose.models.RiderDigitKycSession ||
  mongoose.model('RiderDigitKycSession', DiditKycSessionSchema);

// ---------------------------------------------------------------------------
// Didit API client
// ---------------------------------------------------------------------------

const DIDIT_AUTH_URL = 'https://auth.didit.me/oauth/token';
const DIDIT_BASE_URL = 'https://verification.didit.me';

// Simple in-process token cache (cleared on restart)
let _cachedToken = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && _tokenExpiresAt > now + 30_000) return _cachedToken;

  const clientId = process.env.DIDIT_CLIENT_ID;
  const clientSecret = process.env.DIDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('DIDIT_CLIENT_ID and DIDIT_CLIENT_SECRET environment variables must be set');
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
  console.log('[Didit] Access token refreshed');
  return _cachedToken;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

/**
 * Creates a Didit verification session for a rider.
 * If a valid APPROVED session already exists, returns it immediately.
 */
async function createSession(riderId) {
  // Idempotency: return existing approved session
  const existing = await DiditKycSession.findOne({
    userId: riderId,
    userType: 'rider',
    status: 'APPROVED',
  }).lean();
  if (existing) {
    return { sessionId: existing.sessionId, verificationUrl: existing.verificationUrl, alreadyVerified: true };
  }

  const webhookBaseUrl = (process.env.DIDIT_WEBHOOK_BASE_URL || '').replace(/\/$/, '');
  const callbackUrl = `${webhookBaseUrl}/api/v1/kyc/didit/webhook`;

  const token = await getAccessToken();
  const res = await fetch(`${DIDIT_BASE_URL}/v1/session/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      callback: callbackUrl,
      // OCR reads Aadhaar + PAN; FACE_ID does live biometric match against doc photo
      features: 'OCR + FACE_ID',
      // Encode userType so webhook can route the update correctly
      vendor_data: `rider:${riderId}`,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Didit createSession failed (${res.status}): ${data.error ?? data.message ?? 'unknown'}`);
  }

  const sessionId = data.session_id;
  const verificationUrl = data.url;

  await DiditKycSession.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        userId: riderId,
        userType: 'rider',
        sessionId,
        verificationUrl,
        status: 'created',
        features: 'OCR + FACE_ID',
      },
    },
    { upsert: true, new: true }
  );

  console.log(`[Didit] Session created for rider ${riderId}: ${sessionId}`);
  return { sessionId, verificationUrl, alreadyVerified: false };
}

// ---------------------------------------------------------------------------
// Status polling (called by the app after the browser closes)
// ---------------------------------------------------------------------------

async function getSessionStatus(riderId) {
  const session = await DiditKycSession.findOne({ userId: riderId, userType: 'rider' })
    .sort({ createdAt: -1 })
    .lean();
  if (!session) return { status: 'not_started', sessionId: null };
  return { status: session.status, sessionId: session.sessionId };
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/**
 * Verifies the Didit HMAC-SHA256 signature.
 * Didit sends: X-Signature: sha256=<hex>
 * We reconstruct using JSON.stringify(req.body) — works because Didit sends
 * canonical JSON. Falls back to unsigned if no secret is configured (dev only).
 */
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
 * Maps Didit webhook status → rider KYC document statuses and saves.
 */
async function processWebhook(payload, signatureHeader) {
  // Re-serialize payload for HMAC (must match byte-for-byte what Didit sent)
  const bodyJson = JSON.stringify(payload);
  if (!verifySignature(bodyJson, signatureHeader)) {
    console.warn('[Didit] Webhook signature mismatch – rejecting');
    return { ok: false, reason: 'invalid_signature' };
  }

  const { session_id: sessionId, status, features_status, vendor_data } = payload;

  if (!sessionId || !vendor_data) {
    return { ok: false, reason: 'missing_fields' };
  }

  // Only process rider webhooks here
  const [userType, userId] = (vendor_data || '').split(':');
  if (userType !== 'rider') {
    return { ok: true, reason: 'not_rider' };
  }

  console.log(`[Didit] Webhook for rider ${userId}: session=${sessionId} status=${status}`);

  // Update session record
  await DiditKycSession.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        status,
        webhookPayload: payload,
        completedAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Map Didit status to our document status
  const docStatus = status === 'APPROVED' ? 'verified' : status === 'DECLINED' ? 'failed' : 'pending';
  const rejectedReason =
    status === 'DECLINED'
      ? features_status?.ocr?.decline_reason ||
        features_status?.face_id?.decline_reason ||
        'Verification declined by Didit'
      : undefined;

  // Update the rider's aadhar + pan KYC status
  const update = {
    $set: {
      'documents.aadhar.status': docStatus,
      'documents.pan.status': docStatus,
    },
  };
  if (rejectedReason) {
    update.$set['documents.aadhar.rejectedReason'] = rejectedReason;
    update.$set['documents.pan.rejectedReason'] = rejectedReason;
  }
  if (status === 'APPROVED') {
    update.$set['documents.aadhar.verifiedAt'] = new Date();
    update.$set['documents.pan.verifiedAt'] = new Date();
  }

  await Rider.findOneAndUpdate({ riderId: userId }, update, { strict: false });

  console.log(`[Didit] Rider ${userId} KYC status updated to ${docStatus}`);
  return { ok: true };
}

module.exports = { createSession, getSessionStatus, processWebhook };
