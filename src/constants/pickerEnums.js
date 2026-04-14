/**
 * Shared enums for Picker Workforce + HHD Operations.
 * Use these string values consistently across picker and HHD modules.
 *
 * Note: HHD utils/constants.js has its own ORDER_STATUS (PENDING, RECEIVED, PICKING, COMPLETED, etc.)
 * for the device picking flow. The ORDER_STATUS below is for workforce/fulfillment order lifecycle.
 */

/** Picker onboarding/employment status */
const PICKER_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  SUSPENDED: 'SUSPENDED',
  /** User requested account removal; admin completes deletion after review. */
  DELETION_PENDING: 'DELETION_PENDING',
};

/** Workforce order lifecycle (picker assignment → ready for dispatch) */
const ORDER_STATUS = {
  ASSIGNED: 'ASSIGNED',
  PICKING: 'PICKING',
  PICKED: 'PICKED',
  PACKED: 'PACKED',
  READY_FOR_DISPATCH: 'READY_FOR_DISPATCH',
  CANCELLED: 'CANCELLED',
};

/** Shift assignment/attendance status */
const SHIFT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ABSENT: 'ABSENT',
};

/** HHD device assignment/availability status */
const DEVICE_STATUS = {
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  REPAIR: 'REPAIR',
  LOST: 'LOST',
};

/** Wallet withdrawal request status */
const WITHDRAWAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
};

/** Derived worker status from heartbeat (for Live Picker Board) */
const WORKER_STATUS = {
  AVAILABLE: 'AVAILABLE',
  PICKING: 'PICKING',
  ON_BREAK: 'ON_BREAK',
  OFFLINE: 'OFFLINE',
  DEVICE_IDLE: 'DEVICE_IDLE',
};

module.exports = {
  PICKER_STATUS,
  ORDER_STATUS,
  SHIFT_STATUS,
  DEVICE_STATUS,
  WITHDRAWAL_STATUS,
  WORKER_STATUS,
};
