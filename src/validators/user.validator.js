/**
 * User Validator
 * File: src/validators/user.validator.js
 *
 * P2.2: Validates user data including type discriminator
 */

const { USER_TYPES } = require('../models/user.model');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate user creation
 */
const validateUserCreate = (data) => {
  const errors = [];

  // Validate userType (REQUIRED)
  if (!data.userType) {
    errors.push('userType is required');
  } else if (!Object.values(USER_TYPES).includes(data.userType)) {
    errors.push(`userType must be one of: ${Object.values(USER_TYPES).join(', ')}`);
  }

  // Validate email
  if (!data.email) {
    errors.push('email is required');
  } else if (!EMAIL_REGEX.test(data.email)) {
    errors.push('email must be a valid email address');
  }

  // Validate password
  if (!data.password) {
    errors.push('password is required');
  } else if (data.password.length < 6) {
    errors.push('password must be at least 6 characters');
  }

  // Validate name
  if (!data.name) {
    errors.push('name is required');
  } else if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate user update
 */
const validateUserUpdate = (data) => {
  const errors = [];

  // userType cannot be changed (if provided)
  if (data.userType && !Object.values(USER_TYPES).includes(data.userType)) {
    errors.push(`userType must be one of: ${Object.values(USER_TYPES).join(', ')}`);
  }

  // Email validation if provided
  if (data.email && !EMAIL_REGEX.test(data.email)) {
    errors.push('email must be a valid email address');
  }

  // Password validation if provided
  if (data.password && data.password.length < 6) {
    errors.push('password must be at least 6 characters');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  validateUserCreate,
  validateUserUpdate,
  USER_TYPES
};
