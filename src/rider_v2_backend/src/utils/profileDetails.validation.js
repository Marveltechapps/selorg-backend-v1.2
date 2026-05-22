"use strict";

/**
 * Rider profile field validation (name & email on PATCH /delivery/riders/:id)
 */

const NAME_REGEX = /^[a-zA-Z][a-zA-Z\s.'-]{1,99}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  validateProfileFields,
};
