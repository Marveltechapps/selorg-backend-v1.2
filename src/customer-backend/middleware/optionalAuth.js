function optionalAuth(req, _res, next) {
  try {
    req.user = undefined;
    next();
  } catch {
    req.user = undefined;
    next();
  }
}

module.exports = { optionalAuth };
