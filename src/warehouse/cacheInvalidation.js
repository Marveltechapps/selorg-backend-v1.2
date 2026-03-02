/**
 * Warehouse cache invalidation. Invalidates HTTP response cache after write operations.
 */
const cacheService = require('../core/services/cache.service');

const PREFIX = 'cache:/api/v1/warehouse';

async function invalidateWarehouse() {
  await cacheService.delPattern(`${PREFIX}*`);
}

module.exports = {
  invalidateWarehouse,
};
