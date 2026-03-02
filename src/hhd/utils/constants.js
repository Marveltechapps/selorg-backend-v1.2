const ORDER_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
  BAG_SCANNED: 'bag_scanned',
  PICKING: 'picking',
  COMPLETED: 'completed',
  PHOTO_VERIFIED: 'photo_verified',
  RACK_ASSIGNED: 'rack_assigned',
  HANDED_OFF: 'handed_off',
};

const ITEM_STATUS = {
  PENDING: 'pending',
  FOUND: 'found',
  NOT_FOUND: 'not_found',
  SCANNED: 'scanned',
  COMPLETED: 'completed',
  SUBSTITUTED: 'substituted',
};

const BAG_STATUS = {
  SCANNED: 'scanned',
  IN_USE: 'in_use',
  PHOTO_TAKEN: 'photo_taken',
  COMPLETED: 'completed',
};

const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

/** Order priority for HHD orders (delivery/pick urgency). */
const ORDER_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

const USER_ROLE = {
  PICKER: 'picker',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
};

const ZONE = {
  A: 'Zone A',
  B: 'Zone B',
  C: 'Zone C',
  D: 'Zone D',
};

const PICK_ISSUE_TYPE = {
  ITEM_DAMAGED: 'ITEM_DAMAGED',
  ITEM_MISSING: 'ITEM_MISSING',
  ITEM_EXPIRED: 'ITEM_EXPIRED',
  WRONG_ITEM: 'WRONG_ITEM',
};

const INVENTORY_STATUS = {
  AVAILABLE: 'available',
  DAMAGED: 'damaged',
  EXPIRED: 'expired',
  BLOCKED: 'blocked',
  RESERVED: 'reserved',
};

const ITEM_STATUS_EXTENDED = {
  ...ITEM_STATUS,
  PICKED: 'picked',
  SHORT: 'short',
  ON_HOLD: 'on_hold',
  REASSIGNED: 'reassigned',
};

const PICK_NEXT_ACTION = {
  ALTERNATE_BIN: 'ALTERNATE_BIN',
  SKIP_ITEM: 'SKIP_ITEM',
};

module.exports = {
  ORDER_STATUS,
  ITEM_STATUS,
  BAG_STATUS,
  TASK_STATUS,
  TASK_PRIORITY,
  ORDER_PRIORITY,
  USER_ROLE,
  ZONE,
  PICK_ISSUE_TYPE,
  INVENTORY_STATUS,
  ITEM_STATUS_EXTENDED,
  PICK_NEXT_ACTION,
};
