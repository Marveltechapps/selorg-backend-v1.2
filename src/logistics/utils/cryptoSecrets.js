'use strict';

const crypto = require('crypto');

const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(secret) {
  if (!secret || typeof secret !== 'string') return null;
  // 32-byte key for AES-256-GCM
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptJson(obj, secret) {
  const key = deriveKey(secret);
  if (!key) return '';
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj ?? {});
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptJson(b64, secret) {
  const key = deriveKey(secret);
  if (!key || !b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

module.exports = { encryptJson, decryptJson, deriveKey };
