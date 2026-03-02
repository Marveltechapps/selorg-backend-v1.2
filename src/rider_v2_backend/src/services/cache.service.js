"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cacheService = exports.CacheService = void 0;
var _redis = require("../config/redis.js");
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Cache service for Redis-based caching
 */
var CacheService = exports.CacheService = /*#__PURE__*/function () {
  // 1 hour default

  function CacheService() {
    _classCallCheck(this, CacheService);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "defaultTTL", 3600);
    this.client = (0, _redis.getRedisClient)();
  }

  /**
   * Get value from cache
   */
  return _createClass(CacheService, [{
    key: "get",
    value: (function () {
      var _get = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(key) {
        var value, _t;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.p = _context.n) {
            case 0:
              _context.p = 0;
              _context.n = 1;
              return this.client.get(key);
            case 1:
              value = _context.v;
              if (!value) {
                _context.n = 2;
                break;
              }
              return _context.a(2, JSON.parse(value));
            case 2:
              return _context.a(2, null);
            case 3:
              _context.p = 3;
              _t = _context.v;
              console.error("[Cache] Error getting key ".concat(key, ":"), _t);
              return _context.a(2, null);
          }
        }, _callee, this, [[0, 3]]);
      }));
      function get(_x) {
        return _get.apply(this, arguments);
      }
      return get;
    }()
    /**
     * Set value in cache
     */
    )
  }, {
    key: "set",
    value: (function () {
      var _set = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(key, value, ttl) {
        var serialized, expiration, _t2;
        return _regenerator().w(function (_context2) {
          while (1) switch (_context2.p = _context2.n) {
            case 0:
              _context2.p = 0;
              serialized = JSON.stringify(value);
              expiration = ttl || this.defaultTTL;
              _context2.n = 1;
              return this.client.setex(key, expiration, serialized);
            case 1:
              return _context2.a(2, true);
            case 2:
              _context2.p = 2;
              _t2 = _context2.v;
              console.error("[Cache] Error setting key ".concat(key, ":"), _t2);
              return _context2.a(2, false);
          }
        }, _callee2, this, [[0, 2]]);
      }));
      function set(_x2, _x3, _x4) {
        return _set.apply(this, arguments);
      }
      return set;
    }()
    /**
     * Delete value from cache
     */
    )
  }, {
    key: "delete",
    value: (function () {
      var _delete2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(key) {
        var _t3;
        return _regenerator().w(function (_context3) {
          while (1) switch (_context3.p = _context3.n) {
            case 0:
              _context3.p = 0;
              _context3.n = 1;
              return this.client.del(key);
            case 1:
              return _context3.a(2, true);
            case 2:
              _context3.p = 2;
              _t3 = _context3.v;
              console.error("[Cache] Error deleting key ".concat(key, ":"), _t3);
              return _context3.a(2, false);
          }
        }, _callee3, this, [[0, 2]]);
      }));
      function _delete(_x5) {
        return _delete2.apply(this, arguments);
      }
      return _delete;
    }()
    /**
     * Delete multiple keys matching pattern
     */
    )
  }, {
    key: "deletePattern",
    value: (function () {
      var _deletePattern = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(pattern) {
        var _this$client, keys, _t4;
        return _regenerator().w(function (_context4) {
          while (1) switch (_context4.p = _context4.n) {
            case 0:
              _context4.p = 0;
              _context4.n = 1;
              return this.client.keys(pattern);
            case 1:
              keys = _context4.v;
              if (!(keys.length === 0)) {
                _context4.n = 2;
                break;
              }
              return _context4.a(2, 0);
            case 2:
              _context4.n = 3;
              return (_this$client = this.client).del.apply(_this$client, _toConsumableArray(keys));
            case 3:
              return _context4.a(2, keys.length);
            case 4:
              _context4.p = 4;
              _t4 = _context4.v;
              console.error("[Cache] Error deleting pattern ".concat(pattern, ":"), _t4);
              return _context4.a(2, 0);
          }
        }, _callee4, this, [[0, 4]]);
      }));
      function deletePattern(_x6) {
        return _deletePattern.apply(this, arguments);
      }
      return deletePattern;
    }()
    /**
     * Check if key exists
     */
    )
  }, {
    key: "exists",
    value: (function () {
      var _exists = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(key) {
        var result, _t5;
        return _regenerator().w(function (_context5) {
          while (1) switch (_context5.p = _context5.n) {
            case 0:
              _context5.p = 0;
              _context5.n = 1;
              return this.client.exists(key);
            case 1:
              result = _context5.v;
              return _context5.a(2, result === 1);
            case 2:
              _context5.p = 2;
              _t5 = _context5.v;
              console.error("[Cache] Error checking existence of key ".concat(key, ":"), _t5);
              return _context5.a(2, false);
          }
        }, _callee5, this, [[0, 2]]);
      }));
      function exists(_x7) {
        return _exists.apply(this, arguments);
      }
      return exists;
    }()
    /**
     * Get or set pattern (get from cache, or compute and cache)
     */
    )
  }, {
    key: "getOrSet",
    value: (function () {
      var _getOrSet = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(key, computeFn, ttl) {
        var cached, value;
        return _regenerator().w(function (_context6) {
          while (1) switch (_context6.n) {
            case 0:
              _context6.n = 1;
              return this.get(key);
            case 1:
              cached = _context6.v;
              if (!(cached !== null)) {
                _context6.n = 2;
                break;
              }
              return _context6.a(2, cached);
            case 2:
              _context6.n = 3;
              return computeFn();
            case 3:
              value = _context6.v;
              _context6.n = 4;
              return this.set(key, value, ttl);
            case 4:
              return _context6.a(2, value);
          }
        }, _callee6, this);
      }));
      function getOrSet(_x8, _x9, _x0) {
        return _getOrSet.apply(this, arguments);
      }
      return getOrSet;
    }()
    /**
     * Increment a numeric value
     */
    )
  }, {
    key: "increment",
    value: (function () {
      var _increment = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(key) {
        var by,
          _args7 = arguments,
          _t6;
        return _regenerator().w(function (_context7) {
          while (1) switch (_context7.p = _context7.n) {
            case 0:
              by = _args7.length > 1 && _args7[1] !== undefined ? _args7[1] : 1;
              _context7.p = 1;
              _context7.n = 2;
              return this.client.incrby(key, by);
            case 2:
              return _context7.a(2, _context7.v);
            case 3:
              _context7.p = 3;
              _t6 = _context7.v;
              console.error("[Cache] Error incrementing key ".concat(key, ":"), _t6);
              return _context7.a(2, 0);
          }
        }, _callee7, this, [[1, 3]]);
      }));
      function increment(_x1) {
        return _increment.apply(this, arguments);
      }
      return increment;
    }()
    /**
     * Set expiration on a key
     */
    )
  }, {
    key: "expire",
    value: (function () {
      var _expire = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(key, ttl) {
        var result, _t7;
        return _regenerator().w(function (_context8) {
          while (1) switch (_context8.p = _context8.n) {
            case 0:
              _context8.p = 0;
              _context8.n = 1;
              return this.client.expire(key, ttl);
            case 1:
              result = _context8.v;
              return _context8.a(2, result === 1);
            case 2:
              _context8.p = 2;
              _t7 = _context8.v;
              console.error("[Cache] Error setting expiration on key ".concat(key, ":"), _t7);
              return _context8.a(2, false);
          }
        }, _callee8, this, [[0, 2]]);
      }));
      function expire(_x10, _x11) {
        return _expire.apply(this, arguments);
      }
      return expire;
    }()
    /**
     * Get cache statistics
     */
    )
  }, {
    key: "getStats",
    value: (function () {
      var _getStats = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9() {
        var info, keys, memoryMatch, memory, _t8;
        return _regenerator().w(function (_context9) {
          while (1) switch (_context9.p = _context9.n) {
            case 0:
              _context9.p = 0;
              _context9.n = 1;
              return this.client.info("memory");
            case 1:
              info = _context9.v;
              _context9.n = 2;
              return this.client.dbsize();
            case 2:
              keys = _context9.v;
              // Parse memory info (simplified)
              memoryMatch = info.match(/used_memory_human:(.+)/);
              memory = memoryMatch ? memoryMatch[1].trim() : "unknown";
              return _context9.a(2, {
                keys: keys,
                memory: memory
              });
            case 3:
              _context9.p = 3;
              _t8 = _context9.v;
              console.error("[Cache] Error getting stats:", _t8);
              return _context9.a(2, {
                keys: 0,
                memory: "unknown"
              });
          }
        }, _callee9, this, [[0, 3]]);
      }));
      function getStats() {
        return _getStats.apply(this, arguments);
      }
      return getStats;
    }())
  }]);
}(); // Export singleton instance
var cacheService = exports.cacheService = new CacheService();