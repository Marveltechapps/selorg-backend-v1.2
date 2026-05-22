"use strict";

/**
 * Rider payment details validation (bank account & UPI)
 */

const HOLDER_REGEX = /^[a-zA-Z][a-zA-Z\s.'-]{1,99}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^\d{9,18}$/;
const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

function normalizeHolder(name) {
  return String(name || "").trim();
}

function normalizeAccountNumber(num) {
  return String(num || "").replace(/\D/g, "");
}

function normalizeIfsc(code) {
  return String(code || "").replace(/\s/g, "").toUpperCase();
}

function normalizeUpiId(id) {
  return String(id || "").trim().toLowerCase();
}

function validateBankDetails(bank) {
  const errors = {};
  if (!bank || typeof bank !== "object") {
    return { valid: false, errors: { bankDetails: "Bank details are required" } };
  }

  const holder = normalizeHolder(bank.accountHolderName);
  if (!holder) errors.accountHolderName = "Account holder name is required";
  else if (holder.length < 2) errors.accountHolderName = "Name must be at least 2 characters";
  else if (holder.length > 100) errors.accountHolderName = "Name must be 100 characters or less";
  else if (!HOLDER_REGEX.test(holder)) {
    errors.accountHolderName = "Use letters and spaces only (as on your bank account)";
  }

  const accountNumber = normalizeAccountNumber(bank.accountNumber);
  if (!accountNumber) errors.accountNumber = "Account number is required";
  else if (!ACCOUNT_REGEX.test(accountNumber)) {
    errors.accountNumber = "Account number must be 9–18 digits";
  }

  const ifsc = normalizeIfsc(bank.ifscCode);
  if (!ifsc) errors.ifscCode = "IFSC code is required";
  else if (ifsc.length !== 11) errors.ifscCode = "IFSC must be 11 characters";
  else if (!IFSC_REGEX.test(ifsc)) errors.ifscCode = "Invalid IFSC (e.g. HDFC0001234)";

  return { valid: Object.keys(errors).length === 0, errors, normalized: {
    accountHolderName: holder,
    accountNumber,
    ifscCode: ifsc,
    bankName: String(bank.bankName || "").trim(),
  } };
}

function validateUpiDetails(upi) {
  const errors = {};
  if (!upi || typeof upi !== "object") {
    return { valid: false, errors: { upiDetails: "UPI details are required" } };
  }

  const holder = normalizeHolder(upi.accountHolderName);
  if (!holder) errors.accountHolderName = "Account holder name is required";
  else if (holder.length < 2) errors.accountHolderName = "Name must be at least 2 characters";
  else if (holder.length > 100) errors.accountHolderName = "Name must be 100 characters or less";
  else if (!HOLDER_REGEX.test(holder)) {
    errors.accountHolderName = "Use letters and spaces only (as on your UPI account)";
  }

  const upiId = normalizeUpiId(upi.upiId);
  if (!upiId) errors.upiId = "UPI ID is required";
  else if (!UPI_REGEX.test(upiId)) errors.upiId = "Enter a valid UPI ID (e.g. name@bank)";

  return { valid: Object.keys(errors).length === 0, errors, normalized: {
    accountHolderName: holder,
    upiId,
  } };
}

function prefixErrors(prefix, errors) {
  const out = {};
  for (const [key, message] of Object.entries(errors)) {
    out[`${prefix}.${key}`] = message;
  }
  return out;
}

module.exports = {
  validateBankDetails,
  validateUpiDetails,
  prefixErrors,
  normalizeHolder,
  normalizeAccountNumber,
  normalizeIfsc,
  normalizeUpiId,
};
