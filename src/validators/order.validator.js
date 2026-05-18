/**
 * Order Validator
 * File: src/validators/order.validator.js
 *
 * P2.2: Validates order data including type discriminator
 */

const { ORDER_TYPES } = require('../models/order.model');

/**
 * Validate order creation
 */
const validateOrderCreate = (data) => {
  const errors = [];

  // Validate orderType (REQUIRED)
  if (!data.orderType) {
    errors.push('orderType is required');
  } else if (!Object.values(ORDER_TYPES).includes(data.orderType)) {
    errors.push(`orderType must be one of: ${Object.values(ORDER_TYPES).join(', ')}`);
  }

  // Validate customerId
  if (!data.customerId) {
    errors.push('customerId is required');
  }

  // Validate amount
  if (data.amount === undefined || data.amount === null) {
    errors.push('amount is required');
  } else if (typeof data.amount !== 'number' || data.amount < 0) {
    errors.push('amount must be a non-negative number');
  }

  // Validate items array
  if (data.items && !Array.isArray(data.items)) {
    errors.push('items must be an array');
  }

  // Validate status
  if (data.status) {
    const validStatuses = ['PENDING', 'CONFIRMED', 'PICKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED'];
    if (!validStatuses.includes(data.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate order update
 */
const validateOrderUpdate = (data) => {
  // Same as create, but all fields are optional
  const errors = [];

  // Type cannot be changed (if provided)
  if (data.orderType && !Object.values(ORDER_TYPES).includes(data.orderType)) {
    errors.push(`orderType must be one of: ${Object.values(ORDER_TYPES).join(', ')}`);
  }

  // Validate amount if provided
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount < 0)) {
    errors.push('amount must be a non-negative number');
  }

  // Validate status if provided
  if (data.status) {
    const validStatuses = ['PENDING', 'CONFIRMED', 'PICKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED'];
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
  validateOrderCreate,
  validateOrderUpdate,
  ORDER_TYPES
};
