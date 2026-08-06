/**
 * Firebase Admin SDK initialization for customer push (FCM).
 *
 * Credentials are read ONLY from environment variables (never from committed JSON files):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * Optional (also env-only): FIREBASE_SERVICE_ACCOUNT_JSON — full service-account JSON string.
 *
 * Never commit service-account keys. Keep private keys in backend .env / secret manager only.
 */

const logger = require('../../core/utils/logger');

let app = null;
let messaging = null;
let initAttempted = false;
let initError = null;

function normalizePrivateKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Support env values with escaped newlines ("\\n") from .env / secret managers.
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

function missingDiscreteFields() {
  const missing = [];
  if (!String(process.env.FIREBASE_PROJECT_ID || '').trim()) missing.push('FIREBASE_PROJECT_ID');
  if (!String(process.env.FIREBASE_CLIENT_EMAIL || '').trim()) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '')) missing.push('FIREBASE_PRIVATE_KEY');
  return missing;
}

function loadServiceAccountFromEnv() {
  const jsonRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed.private_key) {
        parsed.private_key = normalizePrivateKey(parsed.private_key);
      }
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error(
          'FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key'
        );
      }
      if (!String(parsed.private_key).includes('BEGIN PRIVATE KEY')) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON private_key is malformed');
      }
      return parsed;
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${err.message}`);
    }
  }

  const missing = missingDiscreteFields();
  if (missing.length === 3) {
    return null;
  }
  if (missing.length > 0) {
    throw new Error(
      `Incomplete Firebase Admin credentials. Missing: ${missing.join(', ')}. ` +
        'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in backend .env.'
    );
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '');

  if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    throw new Error(
      'FIREBASE_PRIVATE_KEY is malformed. Use the PEM value from the service account JSON, ' +
        'with \\n for newlines, wrapped in double quotes.'
    );
  }

  return {
    type: 'service_account',
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

/**
 * Validate that required Firebase env vars are present (does not initialize the SDK).
 * @returns {{ ok: boolean, missing: string[], error?: string }}
 */
function validateFirebaseAdminEnv() {
  try {
    if (String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()) {
      loadServiceAccountFromEnv();
      return { ok: true, missing: [] };
    }
    const missing = missingDiscreteFields();
    if (missing.length > 0) {
      return { ok: false, missing, error: `Missing: ${missing.join(', ')}` };
    }
    loadServiceAccountFromEnv();
    return { ok: true, missing: [] };
  } catch (err) {
    return {
      ok: false,
      missing: missingDiscreteFields(),
      error: err.message || 'invalid_firebase_credentials',
    };
  }
}

/**
 * Lazy-init Firebase Admin. Safe to call repeatedly.
 * @returns {boolean}
 */
function ensureFirebaseAdmin() {
  if (app && messaging) return true;
  if (initAttempted && initError) return false;
  initAttempted = true;

  try {
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');

    if (admin.apps.length > 0) {
      app = admin.app();
      messaging = admin.messaging();
      return true;
    }

    const serviceAccount = loadServiceAccountFromEnv();
    if (!serviceAccount) {
      initError = 'missing_firebase_credentials';
      logger.warn(
        'Firebase Admin not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in backend .env'
      );
      return false;
    }

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    messaging = admin.messaging();
    initError = null;
    logger.info('Firebase Admin initialized for FCM', {
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
    });
    return true;
  } catch (err) {
    initError = err.message || 'firebase_admin_init_failed';
    logger.error('Firebase Admin initialization failed', { err: initError });
    app = null;
    messaging = null;
    return false;
  }
}

function isFirebaseAdminConfigured() {
  if (app && messaging) return true;
  const validation = validateFirebaseAdminEnv();
  return validation.ok;
}

function getFirebaseMessaging() {
  if (!ensureFirebaseAdmin()) return null;
  return messaging;
}

function getFirebaseInitError() {
  return initError;
}

module.exports = {
  ensureFirebaseAdmin,
  isFirebaseAdminConfigured,
  getFirebaseMessaging,
  getFirebaseInitError,
  validateFirebaseAdminEnv,
};
