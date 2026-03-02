const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Validation failed',
      code: 400,
      details: errors.array(),
    });
  }
  next();
};

// Rider ID validation
const validateRiderId = [
  param('riderId')
    .matches(/^RIDER-\d+$/)
    .withMessage('Rider ID must match format RIDER-{number}'),
  validate,
];

// Order ID validation
const validateOrderId = [
  param('orderId')
    .matches(/^ORD-\d+$/)
    .withMessage('Order ID must match format ORD-{number}'),
  validate,
];

// Create Rider validation
const validateCreateRider = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email address is required'),
  body('phone')
    .trim()
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('A valid phone number in E.164 format is required (e.g., +1234567890)'),
  body('status')
    .optional()
    .isIn(['online', 'offline', 'busy', 'idle'])
    .withMessage('Status must be one of: online, offline, busy, idle'),
  body('zone')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Zone must be less than 100 characters'),
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  body('location.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('location.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('capacity')
    .optional()
    .isObject()
    .withMessage('Capacity must be an object'),
  body('capacity.maxLoad')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max load must be at least 1'),
  validate,
];

// Update Rider validation
const validateUpdateRider = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('status')
    .optional()
    .isIn(['online', 'offline', 'busy', 'idle'])
    .withMessage('Status must be one of: online, offline, busy, idle'),
  body('zone')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Zone must be less than 100 characters'),
  validate,
];

// Assign Order validation
const validateAssignOrder = [
  body('riderId')
    .matches(/^RIDER-\d+$/)
    .withMessage('Rider ID must match format RIDER-{number}'),
  body('overrideSla')
    .optional()
    .isBoolean()
    .withMessage('overrideSla must be a boolean'),
  validate,
];

// Alert Order validation
const validateAlertOrder = [
  body('reason')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters'),
  validate,
];

// Auto-assign validation
const validateAutoAssign = [
  body('orderIds')
    .optional()
    .isArray()
    .withMessage('orderIds must be an array'),
  body('orderIds.*')
    .optional()
    .matches(/^ORD-\d+$/)
    .withMessage('Each order ID must match format ORD-{number}'),
  validate,
];

// Search validation
const validateSearch = [
  query('q')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search query is required'),
  query('type')
    .optional()
    .isIn(['riders', 'orders', 'all'])
    .withMessage('Type must be one of: riders, orders, all'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  validate,
];

// Inventory Adjustment validation
const validateCreateAdjustment = [
  body('sku')
    .trim()
    .isLength({ min: 1 })
    .withMessage('SKU is required'),
  body('change')
    .isInt()
    .withMessage('Change must be an integer'),
  body('type')
    .optional()
    .isIn(['Damage Write-off', 'Cycle Count Adj.', 'Expiry Removal', 'Manual Adjustment', 'Found Items', 'Manual Correction'])
    .withMessage('Type must be one of: Damage Write-off, Cycle Count Adj., Expiry Removal, Manual Adjustment, Found Items, Manual Correction'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters'),
  validate,
];

// Cycle Count validation
const validateCreateCycleCount = [
  body('zone')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Zone is required'),
  body('scheduledDate')
    .isISO8601()
    .withMessage('Scheduled date must be a valid date'),
  body('assignedTo')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Assigned to must not be empty'),
  body('itemsTotal')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Items total must be a non-negative integer'),
  validate,
];

// Internal Transfer validation
const validateCreateInternalTransfer = [
  body('fromLocation')
    .trim()
    .isLength({ min: 1 })
    .withMessage('From location is required'),
  body('toLocation')
    .trim()
    .isLength({ min: 1 })
    .withMessage('To location is required'),
  body('sku')
    .trim()
    .isLength({ min: 1 })
    .withMessage('SKU is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  validate,
];

// Reorder Request validation
const validateCreateReorderRequest = [
  body('sku')
    .trim()
    .isLength({ min: 1 })
    .withMessage('SKU is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('priority')
    .optional()
    .isIn(['high', 'medium', 'low'])
    .withMessage('Priority must be one of: high, medium, low'),
  validate,
];

module.exports = {
  validate,
  validateRiderId,
  validateOrderId,
  validateCreateRider,
  validateUpdateRider,
  validateAssignOrder,
  validateAlertOrder,
  validateAutoAssign,
  validateSearch,
  validateCreateAdjustment,
  validateCreateCycleCount,
  validateCreateInternalTransfer,
  validateCreateReorderRequest,
};

