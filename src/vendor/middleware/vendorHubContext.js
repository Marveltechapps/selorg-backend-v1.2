const { runWithVendorHub, resolveHubKeyFromUserDoc } = require('../constants/hubScope');

/**
 * After JWT auth, bind procurement hub for this request (AsyncLocalStorage).
 * Ensures vendor@selorg.com (and users with hub fields) only query their hub's data.
 */
function bindVendorHubContext(req, res, next) {
  const hubKey = resolveHubKeyFromUserDoc(req.user);
  req.vendorHubKey = hubKey;
  runWithVendorHub(hubKey, () => next());
}

module.exports = { bindVendorHubContext };
