"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.notFoundHandler = void 0;
var notFoundHandler = exports.notFoundHandler = function notFoundHandler(req, res, _next) {
  console.warn("[404] Route not found: ".concat(req.method, " ").concat(req.path), {
    query: req.query,
    timestamp: new Date().toISOString()
  });
  res.status(404).json({
    error: "Route not found",
    code: "ROUTE_NOT_FOUND",
    path: req.path,
    method: req.method
  });
};