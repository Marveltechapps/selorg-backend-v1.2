const crypto = require('crypto');
const OTP_LENGTH = Number(process.env.OTP_LENGTH) || 4;
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 300;
const OTP_PEPPER = process.env.OTP_PEPPER || process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'default_pepper_change_in_prod';

function generateOtp(length = OTP_LENGTH) {
  const max = 10 ** length;
  const n = Math.floor(Math.random() * (max - max / 10)) + max / 10;
  return String(n).slice(0, length);
}
function hashOtp(otp) {
  return crypto.createHmac('sha256', OTP_PEPPER).update(String(otp)).digest('hex');
}
function verifyOtp(otp, hash) {
  const computed = hashOtp(otp);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(String(hash)));
}
function getExpiryDate(ttlSeconds = OTP_TTL_SECONDS) {
  return new Date(Date.now() + ttlSeconds * 1000);
}
module.exports = { generateOtp, hashOtp, verifyOtp, getExpiryDate };
