/**
 * Order State Machine - validates status transitions for darkstore orders.
 * Prevents invalid transitions and ensures consistent order lifecycle.
 */

const { ORDER_STATUS } = require('../../constants/pickerEnums');

// Statuses that can transition TO ASSIGNED (i.e. order is unassigned)
const ASSIGNABLE_STATUSES = ['new', 'processing', 'ready'];

// Valid transitions: fromStatus -> [allowed toStatuses]
const VALID_TRANSITIONS = {
  new: [ORDER_STATUS.ASSIGNED, 'cancelled', 'rto'],
  processing: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING, ORDER_STATUS.PACKED, ORDER_STATUS.READY_FOR_DISPATCH, 'cancelled', 'rto'],
  ready: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.PACKED, ORDER_STATUS.READY_FOR_DISPATCH, 'cancelled', 'rto'],
  [ORDER_STATUS.ASSIGNED]: [ORDER_STATUS.PICKING, ORDER_STATUS.CANCELLED, 'cancelled'],
  [ORDER_STATUS.PICKING]: [ORDER_STATUS.PICKED, ORDER_STATUS.CANCELLED, 'cancelled'],
  [ORDER_STATUS.PICKED]: [ORDER_STATUS.PACKED, ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED, 'cancelled'],
  [ORDER_STATUS.PACKED]: [ORDER_STATUS.READY_FOR_DISPATCH, ORDER_STATUS.CANCELLED, 'cancelled'],
  [ORDER_STATUS.READY_FOR_DISPATCH]: [ORDER_STATUS.CANCELLED, 'cancelled'],
  cancelled: [],
  rto: [],
  completed: [],
  [ORDER_STATUS.CANCELLED]: [],
};

// Normalize legacy status names to workforce status
const NORMALIZE_STATUS = {
  Queued: 'new',
  Picking: 'processing',
  Packing: 'ready',
  [ORDER_STATUS.ASSIGNED]: ORDER_STATUS.ASSIGNED,
  [ORDER_STATUS.PICKING]: ORDER_STATUS.PICKING,
  [ORDER_STATUS.PICKED]: ORDER_STATUS.PICKED,
  [ORDER_STATUS.PACKED]: ORDER_STATUS.PACKED,
  [ORDER_STATUS.READY_FOR_DISPATCH]: ORDER_STATUS.READY_FOR_DISPATCH,
  [ORDER_STATUS.CANCELLED]: 'cancelled',
};

/**
 * Check if a transition from currentStatus to newStatus is valid.
 * @param {string} currentStatus - Current order status
 * @param {string} newStatus - Desired new status
 * @returns {{ valid: boolean, error?: string }}
 */
function canTransition(currentStatus, newStatus) {
  const from = currentStatus || 'new';
  const to = NORMALIZE_STATUS[newStatus] || newStatus;

  // Cancelled can be reached from most states
  if (to === 'cancelled' || to === ORDER_STATUS.CANCELLED) {
    const terminal = ['cancelled', ORDER_STATUS.CANCELLED, 'rto', 'completed'];
    if (terminal.includes(from)) {
      return { valid: false, error: `Cannot cancel order in status "${from}"` };
    }
    return { valid: true };
  }

  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) {
    return { valid: false, error: `Unknown current status: ${from}` };
  }
  if (!allowed.includes(to)) {
    return {
      valid: false,
      error: `Invalid transition: cannot move from "${from}" to "${to}". Allowed: ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Validate transition and throw if invalid.
 * @throws {Error} If transition is invalid
 */
function validateTransition(currentStatus, newStatus) {
  const result = canTransition(currentStatus, newStatus);
  if (!result.valid) {
    const err = new Error(result.error);
    err.code = 'INVALID_ORDER_TRANSITION';
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Check if order can be assigned (must be in new/processing/ready).
 */
function canAssign(currentStatus) {
  const from = currentStatus || 'new';
  return ASSIGNABLE_STATUSES.includes(from) || from === ORDER_STATUS.ASSIGNED;
}

/**
 * Check if order can start picking (must be ASSIGNED).
 */
function canStartPicking(currentStatus) {
  return currentStatus === ORDER_STATUS.ASSIGNED;
}

/**
 * Check if order can complete picking (must be PICKING).
 */
function canCompletePicking(currentStatus) {
  return currentStatus === ORDER_STATUS.PICKING;
}

module.exports = {
  VALID_TRANSITIONS,
  ASSIGNABLE_STATUSES,
  canTransition,
  validateTransition,
  canAssign,
  canStartPicking,
  canCompletePicking,
  NORMALIZE_STATUS,
};
