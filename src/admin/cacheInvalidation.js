/**
 * Admin cache invalidation helpers.
 * Invalidates HTTP response cache keys (cache:url:query) after write operations.
 */
const cacheService = require('../core/services/cache.service');

const PREFIX = 'cache:/api/v1/admin';

async function invalidateUsers() {
  await cacheService.delPattern(`${PREFIX}/users*`);
}

async function invalidateRoles() {
  await cacheService.delPattern(`${PREFIX}/roles*`);
}

async function invalidatePermissions() {
  await cacheService.delPattern(`${PREFIX}/permissions*`);
}

async function invalidateStores() {
  await cacheService.delPattern(`${PREFIX}/stores*`);
}

async function invalidateWarehouses() {
  await cacheService.delPattern(`${PREFIX}/warehouses*`);
}

async function invalidateStaff() {
  await cacheService.delPattern(`${PREFIX}/staff*`);
}

async function invalidateAudit() {
  await cacheService.delPattern(`${PREFIX}/logs*`);
}

async function invalidateCacheStats() {
  await cacheService.delPattern(`${PREFIX}/cache*`);
}

module.exports = {
  invalidateUsers,
  invalidateRoles,
  invalidatePermissions,
  invalidateStores,
  invalidateWarehouses,
  invalidateStaff,
  invalidateAudit,
  invalidateCacheStats,
};
