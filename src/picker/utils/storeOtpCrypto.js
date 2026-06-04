'use strict';

const crypto = require('crypto');
const { encryptJson, decryptJson } = require('../../logistics/utils/cryptoSecrets');

const PEPPER = () =>
  process.env.PICKER_STORE_OTP_PEPPER || process.env.JWT_SECRET || 'picker-store-otp-pepper';

function getEncryptionSecret() {
  return (
    process.env.PICKER_STORE_OTP_SECRET ||
    process.env.JWT_SECRET ||
    'picker-store-otp-dev-secret-change-in-production'
  );
}

function encryptStoreOtp(otp) {
  return encryptJson({ otp: String(otp) }, getEncryptionSecret());
}

function isValidStoreOtp(otp) {
  return /^\d{6}$/.test(String(otp ?? '').trim());
}

function decryptStoreOtp(ciphertext) {
  const payload = decryptJson(ciphertext, getEncryptionSecret());
  const otp = payload?.otp != null ? String(payload.otp).trim() : '';
  return isValidStoreOtp(otp) ? otp : null;
}

function hashStoreOtp(storeId, otp) {
  return crypto.createHash('sha256').update(`${storeId}:${otp}:${PEPPER()}`).digest('hex');
}

module.exports = {
  encryptStoreOtp,
  decryptStoreOtp,
  hashStoreOtp,
  isValidStoreOtp,
};
