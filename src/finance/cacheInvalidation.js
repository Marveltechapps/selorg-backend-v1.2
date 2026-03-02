/**
 * Finance cache invalidation. Invalidates HTTP response cache after write operations.
 */
const cacheService = require('../core/services/cache.service');

const PREFIX = 'cache:/api/v1/finance';

async function invalidateFinance() {
  await cacheService.delPattern(`${PREFIX}*`);
}

module.exports = {
  invalidateFinance,
};
