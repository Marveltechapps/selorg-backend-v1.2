const { runWithVendorHub, resolveHubKeyFromUserDoc } = require('../../vendor/constants/hubScope');

/**
 * After JWT auth on finance vendor-payments routes, bind the same hub context as procurement
 * so mergeHubFilter / hubFieldsForCreate work for VendorInvoice and finance Vendor.
 */
function bindFinanceHubContext(req, res, next) {
  const hubKey = resolveHubKeyFromUserDoc(req.user);
  req.vendorHubKey = hubKey;
  runWithVendorHub(hubKey, () => next());
}

module.exports = { bindFinanceHubContext };
