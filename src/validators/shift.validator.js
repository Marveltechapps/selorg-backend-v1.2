/**
 * Shift Validator
 * File: src/validators/shift.validator.js
 *
 * P2.2: Validates shift data including type discriminator
 */

const { SHIFT_TYPES } = require('../models/shift.model');

/**
 * Validate shift creation
 */
const validateShiftCreate = (data) => {
  const errors = [];

  // Validate shiftType (REQUIRED)
  if (!data.shiftType) {
    errors.push('shiftType is required');
  } else if (!Object.values(SHIFT_TYPES).includes(data.shiftType)) {
    errors.push(`shiftType must be one of: ${Object.values(SHIFT_TYPES).join(', ')}`);
  }

  // Validate userId
  if (!data.userId) {
    errors.push('userId is required');
  }

  // Validate startTime
  if (!data.startTime) {
    errors.push('startTime is required');
  } else if (!(data.startTime instanceof Date) && isNaN(Date.parse(data.startTime))) {
    errors.push('startTime must be a valid date');
  }

  // Validate endTime
  if (!data.endTime) {
    errors.push('endTime is required');
  } else if (!(data.endTime instanceof Date) && isNaN(Date.parse(data.endTime))) {
    errors.push('endTime must be a valid date');
  }

  // Validate start < end
  if (data.startTime && data.endTime) {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (start >= end) {
      errors.push('startTime must be before endTime');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate shift update
 */
const validateShiftUpdate = (data) => {
  const errors = [];

  // shiftType cannot be changed (if provided)
  if (data.shiftType && !Object.values(SHIFT_TYPES).includes(data.shiftType)) {
    errors.push(`shiftType must be one of: ${Object.values(SHIFT_TYPES).join(', ')}`);
  }

  // Validate status if provided
  if (data.status) {
    const validStatuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(data.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  validateShiftCreate,
  validateShiftUpdate,
  SHIFT_TYPES
};
