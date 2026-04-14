const crypto = require('crypto');
const logger = require('../core/utils/logger');

function parseKeyMaterial(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  if (/^[0-9a-fA-F]{32}$/.test(s)) return Buffer.from(s, 'hex');
  try {
    const b64 = Buffer.from(s, 'base64');
    if (b64.length === 32 || b64.length === 16) return b64;
  } catch (_) {
    /* ignore */
  }
  if (s.length === 16) return Buffer.from(s, 'utf8');
  return null;
}

function parseIvMaterial(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^[0-9a-fA-F]{32}$/.test(s)) return Buffer.from(s, 'hex');
  try {
    const b64 = Buffer.from(s, 'base64');
    if (b64.length === 16) return b64;
  } catch (_) {
    /* ignore */
  }
  if (s.length === 16) return Buffer.from(s, 'utf8');
  return null;
}

/**
 * Optional AES-256-CBC check for encryption key + IV (hex or base64).
 * Checks PAYMENT_AES_KEY / PAYMENT_AES_IV first, else WORLDLINE_ENC_KEY / WORLDLINE_ENC_IV.
 * Paynimo checkout tokens use SHA-256/512 over WORLDLINE_SALT; ENC_* is separate optional material.
 */
function verifyOptionalPaymentAesEnv() {
  let keyRaw = process.env.PAYMENT_AES_KEY;
  let ivRaw = process.env.PAYMENT_AES_IV;
  let label = 'PAYMENT_AES';

  if (!keyRaw && !ivRaw) {
    keyRaw = process.env.WORLDLINE_ENC_KEY;
    ivRaw = process.env.WORLDLINE_ENC_IV;
    label = 'WORLDLINE_ENC';
  }

  if (!keyRaw && !ivRaw) {
    logger.info(
      'Payment AES: no PAYMENT_AES_* or WORLDLINE_ENC_* set (optional). Paynimo request token uses SHA + WORLDLINE_SALT'
    );
    return { ok: true, mode: 'none' };
  }
  if (!keyRaw || !ivRaw) {
    logger.warn(`Payment AES: set both ${label}_KEY (32 bytes) and ${label}_IV (16 bytes), or omit both`);
    return { ok: false, mode: 'incomplete' };
  }
  const key = parseKeyMaterial(keyRaw);
  const iv = parseIvMaterial(ivRaw);
  if (!key || (key.length !== 32 && key.length !== 16)) {
    logger.warn(
      `Payment AES: ${label}_KEY must decode to 32 bytes (AES-256) or 16 bytes (AES-128), hex/base64/utf8`
    );
    return { ok: false, mode: 'bad_key' };
  }
  if (!iv || iv.length !== 16) {
    logger.warn(`Payment AES: ${label}_IV must decode to 16 bytes (hex 32 chars or base64)`);
    return { ok: false, mode: 'bad_iv' };
  }
  const algo = key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
  try {
    const cipher = crypto.createCipheriv(algo, key, iv);
    let enc = cipher.update('aes-check', 'utf8', 'hex');
    enc += cipher.final('hex');
    const decipher = crypto.createDecipheriv(algo, key, iv);
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    if (dec !== 'aes-check') {
      logger.error('Payment AES: round-trip mismatch');
      return { ok: false, mode: 'roundtrip_failed' };
    }
    logger.info(`Payment AES: ${label}_KEY and ${label}_IV validated (${algo} round-trip OK)`);
    return { ok: true, mode: algo, label };
  } catch (e) {
    logger.warn('Payment AES: cipher self-test failed', { error: e?.message });
    return { ok: false, mode: 'cipher_error' };
  }
}

module.exports = { verifyOptionalPaymentAesEnv, parseKeyMaterial, parseIvMaterial };
