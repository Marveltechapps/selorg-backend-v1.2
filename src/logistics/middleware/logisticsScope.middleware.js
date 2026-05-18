'use strict';

/**
 * @param {'VENDOR_TO_WAREHOUSE'|'WAREHOUSE_TO_DARKSTORE'} type
 */
function logisticsScope(type) {
  return (req, _res, next) => {
    req.logisticsScopeType = type;
    next();
  };
}

module.exports = { logisticsScope };
