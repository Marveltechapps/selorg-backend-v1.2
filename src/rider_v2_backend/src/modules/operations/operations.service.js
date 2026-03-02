"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateInventoryItem = exports.getWarehouses = exports.getInventoryItem = exports.getInventory = exports.getFulfillmentTasks = exports.advanceFulfillmentTask = void 0;
var _Inventory = require("../../models/Inventory.js");
var _Warehouse = require("../../models/Warehouse.js");
var _FulfillmentTask = require("../../models/FulfillmentTask.js");
var _Rider = require("../../models/Rider.js");
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var getInventory = exports.getInventory = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var query,
      filter,
      items,
      _args = arguments;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          query = _args.length > 0 && _args[0] !== undefined ? _args[0] : {};
          filter = {};
          if (query.warehouseCode) {
            filter.warehouseCode = query.warehouseCode;
          }
          if (query.status && query.status !== "all") {
            filter.status = query.status;
          }
          _context.n = 1;
          return _Inventory.InventoryItem.find(filter).sort({
            lastUpdated: -1
          }).lean();
        case 1:
          items = _context.v;
          return _context.a(2, items.map(function (item) {
            return {
              id: item._id.toString(),
              sku: item.sku,
              name: item.name,
              batch: item.batch,
              quantityAvailable: item.quantityAvailable,
              quantityReserved: item.quantityReserved,
              warehouseCode: item.warehouseCode,
              temperatureBand: item.temperatureBand,
              lastUpdated: item.lastUpdated.toISOString(),
              status: item.status
            };
          }));
      }
    }, _callee);
  }));
  return function getInventory() {
    return _ref.apply(this, arguments);
  };
}();
var getInventoryItem = exports.getInventoryItem = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(id) {
    var item;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          _context2.n = 1;
          return _Inventory.InventoryItem.findById(id).lean();
        case 1:
          item = _context2.v;
          if (item) {
            _context2.n = 2;
            break;
          }
          throw new Error("Inventory item not found");
        case 2:
          return _context2.a(2, {
            id: item._id.toString(),
            sku: item.sku,
            name: item.name,
            batch: item.batch,
            quantityAvailable: item.quantityAvailable,
            quantityReserved: item.quantityReserved,
            warehouseCode: item.warehouseCode,
            temperatureBand: item.temperatureBand,
            lastUpdated: item.lastUpdated.toISOString(),
            status: item.status
          });
      }
    }, _callee2);
  }));
  return function getInventoryItem(_x) {
    return _ref2.apply(this, arguments);
  };
}();
var updateInventoryItem = exports.updateInventoryItem = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(id, updates) {
    var updateData, item;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          updateData = _objectSpread(_objectSpread({}, updates), {}, {
            lastUpdated: new Date()
          });
          _context3.n = 1;
          return _Inventory.InventoryItem.findByIdAndUpdate(id, updateData, {
            "new": true
          }).lean();
        case 1:
          item = _context3.v;
          if (item) {
            _context3.n = 2;
            break;
          }
          throw new Error("Inventory item not found");
        case 2:
          return _context3.a(2, {
            id: item._id.toString(),
            sku: item.sku,
            name: item.name,
            batch: item.batch,
            quantityAvailable: item.quantityAvailable,
            quantityReserved: item.quantityReserved,
            warehouseCode: item.warehouseCode,
            temperatureBand: item.temperatureBand,
            lastUpdated: item.lastUpdated.toISOString(),
            status: item.status
          });
      }
    }, _callee3);
  }));
  return function updateInventoryItem(_x2, _x3) {
    return _ref3.apply(this, arguments);
  };
}();
var getFulfillmentTasks = exports.getFulfillmentTasks = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(warehouseCode) {
    var filter, tasks;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          filter = {
            status: {
              $in: ["pending", "in_progress", "blocked"]
            }
          };
          if (warehouseCode) {
            filter.warehouseCode = warehouseCode;
          }
          _context4.n = 1;
          return _FulfillmentTask.FulfillmentTask.find(filter).sort({
            priority: 1,
            createdAt: 1
          }).lean();
        case 1:
          tasks = _context4.v;
          return _context4.a(2, tasks.map(function (task) {
            return {
              id: task._id.toString(),
              orderId: task.orderId,
              type: task.type,
              priority: task.priority,
              status: task.status,
              etaMinutes: task.etaMinutes,
              customerName: task.customerName,
              addressSummary: task.addressSummary,
              warehouseCode: task.warehouseCode,
              notes: task.notes
            };
          }));
      }
    }, _callee4);
  }));
  return function getFulfillmentTasks(_x4) {
    return _ref4.apply(this, arguments);
  };
}();
var advanceFulfillmentTask = exports.advanceFulfillmentTask = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(id) {
    var task, newStatus, updateData, updated, _t;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return _FulfillmentTask.FulfillmentTask.findById(id).lean();
        case 1:
          task = _context5.v;
          if (task) {
            _context5.n = 2;
            break;
          }
          throw new Error("Fulfillment task not found");
        case 2:
          _t = task.status;
          _context5.n = _t === "pending" ? 3 : _t === "in_progress" ? 4 : _t === "blocked" ? 4 : 5;
          break;
        case 3:
          newStatus = "in_progress";
          return _context5.a(3, 6);
        case 4:
          newStatus = "complete";
          return _context5.a(3, 6);
        case 5:
          throw new Error("Task is already complete");
        case 6:
          updateData = {
            status: newStatus
          };
          if (newStatus === "in_progress" && !task.startedAt) {
            updateData.startedAt = new Date();
          }
          if (newStatus === "complete") {
            updateData.completedAt = new Date();
          }
          _context5.n = 7;
          return _FulfillmentTask.FulfillmentTask.findByIdAndUpdate(id, updateData, {
            "new": true
          }).lean();
        case 7:
          updated = _context5.v;
          if (updated) {
            _context5.n = 8;
            break;
          }
          throw new Error("Failed to update task");
        case 8:
          return _context5.a(2, {
            id: updated._id.toString(),
            orderId: updated.orderId,
            type: updated.type,
            priority: updated.priority,
            status: updated.status,
            etaMinutes: updated.etaMinutes,
            customerName: updated.customerName,
            addressSummary: updated.addressSummary,
            warehouseCode: updated.warehouseCode,
            notes: updated.notes
          });
      }
    }, _callee5);
  }));
  return function advanceFulfillmentTask(_x5) {
    return _ref5.apply(this, arguments);
  };
}();
var getWarehouses = exports.getWarehouses = /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7() {
    var warehouses, summaries;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.n) {
        case 0:
          _context7.n = 1;
          return _Warehouse.Warehouse.find({
            isActive: true
          }).lean();
        case 1:
          warehouses = _context7.v;
          _context7.n = 2;
          return Promise.all(warehouses.map(/*#__PURE__*/function () {
            var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(warehouse) {
              var _yield$Promise$all, _yield$Promise$all2, inventoryStats, activeRiders, openTasks, stats;
              return _regenerator().w(function (_context6) {
                while (1) switch (_context6.n) {
                  case 0:
                    _context6.n = 1;
                    return Promise.all([_Inventory.InventoryItem.aggregate([{
                      $match: {
                        warehouseCode: warehouse.code
                      }
                    }, {
                      $group: {
                        _id: null,
                        totalSkus: {
                          $sum: 1
                        },
                        lowStock: {
                          $sum: {
                            $cond: [{
                              $eq: ["$status", "low"]
                            }, 1, 0]
                          }
                        },
                        damaged: {
                          $sum: {
                            $cond: [{
                              $eq: ["$status", "damaged"]
                            }, 1, 0]
                          }
                        }
                      }
                    }]), _Rider.Rider.countDocuments({
                      "currentShift.warehouseCode": warehouse.code,
                      availability: {
                        $in: ["available", "busy"]
                      }
                    }), _FulfillmentTask.FulfillmentTask.countDocuments({
                      warehouseCode: warehouse.code,
                      status: {
                        $in: ["pending", "in_progress", "blocked"]
                      }
                    })]);
                  case 1:
                    _yield$Promise$all = _context6.v;
                    _yield$Promise$all2 = _slicedToArray(_yield$Promise$all, 3);
                    inventoryStats = _yield$Promise$all2[0];
                    activeRiders = _yield$Promise$all2[1];
                    openTasks = _yield$Promise$all2[2];
                    stats = inventoryStats[0] || {
                      totalSkus: 0,
                      lowStock: 0,
                      damaged: 0
                    };
                    return _context6.a(2, {
                      code: warehouse.code,
                      name: warehouse.name,
                      region: warehouse.region,
                      utilization: warehouse.capacity.total > 0 ? warehouse.capacity.used / warehouse.capacity.total : 0,
                      activeRiders: activeRiders,
                      openTasks: openTasks,
                      inventoryHealth: {
                        totalSkus: stats.totalSkus,
                        lowStock: stats.lowStock,
                        damaged: stats.damaged
                      }
                    });
                }
              }, _callee6);
            }));
            return function (_x6) {
              return _ref7.apply(this, arguments);
            };
          }()));
        case 2:
          summaries = _context7.v;
          return _context7.a(2, summaries);
      }
    }, _callee7);
  }));
  return function getWarehouses() {
    return _ref6.apply(this, arguments);
  };
}();