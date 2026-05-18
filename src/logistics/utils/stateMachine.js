'use strict';

const ALLOWED = {
  CREATED: ['DRIVER_ASSIGNED', 'CANCELLED', 'FAILED'],
  DRIVER_ASSIGNED: ['PICKED_UP', 'CANCELLED', 'FAILED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: [],
};

function canTransition(from, to) {
  if (!from || !to) return false;
  const next = ALLOWED[from];
  return Array.isArray(next) && next.includes(to);
}

module.exports = { canTransition, ALLOWED };
