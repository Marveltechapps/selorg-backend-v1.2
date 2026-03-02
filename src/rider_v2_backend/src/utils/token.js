"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.verifyToken = exports.signToken = void 0;
var _jsonwebtoken = _interopRequireDefault(require("jsonwebtoken"));
var _env = require("../config/env.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
var jwtSecret = _env.env.JWT_SECRET;
var signToken = exports.signToken = function signToken(payload) {
  var expiresIn = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "7d";
  return _jsonwebtoken["default"].sign(payload, jwtSecret, {
    expiresIn: expiresIn
  });
};
var verifyToken = exports.verifyToken = function verifyToken(token) {
  return _jsonwebtoken["default"].verify(token, jwtSecret);
};