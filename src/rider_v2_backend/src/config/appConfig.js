"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSmsMessageParam = exports.getSmsToParam = exports.getSmsVendorUrl = void 0;

var _path = require("path");
var _fs = require("fs");

var _configPath = _path.join(__dirname, "config.json");
var _rootConfigPath = _path.resolve(__dirname, "..", "..", "..", "config.json");
var _config = null;

function loadConfig() {
  if (_config !== null) return _config;
  try {
    var raw = (0, _fs.readFileSync)(_configPath, "utf8");
    _config = JSON.parse(raw);
  } catch (e) {
    _config = {};
  }
  try {
    var rootRaw = (0, _fs.readFileSync)(_rootConfigPath, "utf8");
    var rootC = JSON.parse(rootRaw);
    if (!(_config.smsvendor && String(_config.smsvendor).trim())) _config.smsvendor = rootC.smsvendor;
    if (!(_config.smsParamMobile && String(_config.smsParamMobile).trim())) _config.smsParamMobile = rootC.smsParamMobile;
    if (!(_config.smsParamMessage && String(_config.smsParamMessage).trim())) _config.smsParamMessage = rootC.smsParamMessage;
  } catch (_) {}
  return _config;
}

var getSmsVendorUrl = exports.getSmsVendorUrl = function getSmsVendorUrl() {
  if (process.env.SMS_VENDOR_URL && process.env.SMS_VENDOR_URL.trim()) {
    return process.env.SMS_VENDOR_URL.trim();
  }
  var c = loadConfig();
  return (c.smsvendor && String(c.smsvendor).trim()) || null;
};

// Recipient parameter name for SMS API (e.g. "to", "mobile", or "paramMobile"). Set in config.json as "smsToParam" or "smsParamMobile".
var getSmsToParam = exports.getSmsToParam = function getSmsToParam() {
  if (process.env.SMS_TO_PARAM && process.env.SMS_TO_PARAM.trim()) {
    return process.env.SMS_TO_PARAM.trim();
  }
  var c = loadConfig();
  return (c.smsToParam && String(c.smsToParam).trim()) || (c.smsParamMobile && String(c.smsParamMobile).trim()) || "to";
};

var getSmsMessageParam = exports.getSmsMessageParam = function getSmsMessageParam() {
  if (process.env.SMS_MESSAGE_PARAM && process.env.SMS_MESSAGE_PARAM.trim()) {
    return process.env.SMS_MESSAGE_PARAM.trim();
  }
  var c = loadConfig();
  return (c.smsParamMessage && String(c.smsParamMessage).trim()) || "message";
};
