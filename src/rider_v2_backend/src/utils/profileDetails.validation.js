"use strict";

/**
 * Rider profile field validation (name & email on PATCH /delivery/riders/:id)
 */

const NAME_REGEX = /^[a-zA-Z][a-zA-Z\s.'-]{1,99}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const PHONE_E164_REGEX = /^\+?[1-9]\d{9,14}$/;

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhoneDigits(phone) {
  var digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

function formatPhoneE164(digits) {
  if (!digits) return "";
  if (digits.length === 10) return "+91" + digits;
  return digits.startsWith("+") ? digits : "+" + digits;
}

function validateProfileFields(updates) {
  const errors = {};
  const normalized = {};

  if (updates.name !== undefined) {
    const name = normalizeName(updates.name);
    if (!name) errors.name = "Full name is required";
    else if (name.length < 2) errors.name = "Name must be at least 2 characters";
    else if (name.length > 100) errors.name = "Name must be 100 characters or less";
    else if (!NAME_REGEX.test(name)) errors.name = "Use letters and spaces only";
    else normalized.name = name;
  }

  if (updates.email !== undefined) {
    const email = normalizeEmail(updates.email);
    if (!email) errors.email = "Email address is required";
    else if (email.length > 254) errors.email = "Email is too long";
    else if (!EMAIL_REGEX.test(email)) errors.email = "Enter a valid email address";
    else normalized.email = email;
  }

  if (updates.phoneNumber !== undefined) {
    var digits = normalizePhoneDigits(updates.phoneNumber);
    if (!digits) errors.phoneNumber = "Phone number is required";
    else if (!INDIAN_MOBILE_REGEX.test(digits)) {
      errors.phoneNumber = "Enter a valid 10-digit mobile number starting with 6–9";
    } else {
      var formatted = formatPhoneE164(digits);
      if (!PHONE_E164_REGEX.test(formatted)) {
        errors.phoneNumber = "Invalid phone number format";
      } else normalized.phoneNumber = formatted;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  validateProfileFields,
};
