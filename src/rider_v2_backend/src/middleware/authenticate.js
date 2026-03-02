"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.authenticate = void 0;
var _token = require("../utils/token.js");
var authenticate = exports.authenticate = function authenticate(req, res, next) {
  var authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: "Authorization header missing"
    });
  }
  var token = authHeader.replace("Bearer ", "");
  try {
    var payload = (0, _token.verifyToken)(token);
    req.user = {
      id: payload.sub,
      phoneNumber: payload.phoneNumber,
      name: payload.name
    };
    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token"
    });
  }
};