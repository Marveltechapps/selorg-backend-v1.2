/**
 * Darkstore cache invalidation. Invalidates HTTP response cache after write operations.
 */
const cacheService = require('../core/services/cache.service');

const PREFIX = 'cache:/api/v1/darkstore';

async function invalidateDarkstore() {
  await cacheService.delPattern(`${PREFIX}*`);
}

module.exports = {
  invalidateDarkstore,
};
