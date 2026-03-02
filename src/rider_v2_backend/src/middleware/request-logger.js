"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.requestLogger = void 0;
var _crypto = require("crypto");
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
// Extend Express Request to include request ID

/**
 * Request logging middleware
 * Logs all incoming requests with request ID for tracing
 */
var requestLogger = exports.requestLogger = function requestLogger(req, res, next) {
  // Generate unique request ID
  var requestId = (0, _crypto.randomUUID)();
  req.requestId = requestId;

  // Log request start
  var startTime = Date.now();
  var logData = {
    requestId: requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: sanitizeHeaders(req.headers),
    timestamp: new Date().toISOString()
  };
  console.log("[Request] ".concat(req.method, " ").concat(req.path), logData);

  // Log response when finished
  res.on("finish", function () {
    var duration = Date.now() - startTime;
    var responseLog = {
      requestId: requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: "".concat(duration, "ms"),
      timestamp: new Date().toISOString()
    };
    if (res.statusCode >= 400) {
      console.error("[Response] ".concat(req.method, " ").concat(req.path, " ").concat(res.statusCode), responseLog);
    } else {
      console.log("[Response] ".concat(req.method, " ").concat(req.path, " ").concat(res.statusCode), responseLog);
    }
  });
  next();
};

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers) {
  var sanitized = {};
  var sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  for (var _i = 0, _Object$entries = Object.entries(headers); _i < _Object$entries.length; _i++) {
    var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
      key = _Object$entries$_i[0],
      value = _Object$entries$_i[1];
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = String(value);
    }
  }
  return sanitized;
}