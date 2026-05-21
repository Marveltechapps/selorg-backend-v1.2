/**
 * Picker HTTP response cache invalidation after write operations.
 */
const cacheService = require('../core/services/cache.service');

const PREFIX = 'cache:/api/v1/picker';

async function invalidatePickerCache() {
  await cacheService.delPattern(`${PREFIX}*`);
}

module.exports = {
  invalidatePickerCache,
};
