"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.operationsRouter = void 0;
var _express = require("express");
var _zod = require("zod");
var operationsService = _interopRequireWildcard(require("./operations.service.js"));
var _authenticate = require("../../middleware/authenticate.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t7 in e) "default" !== _t7 && {}.hasOwnProperty.call(e, _t7) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t7)) && (i.get || i.set) ? o(f, _t7, i) : f[_t7] = e[_t7]); return f; })(e, t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var operationsRouter = exports.operationsRouter = (0, _express.Router)();
var inventoryQuerySchema = _zod.z.object({
  warehouseCode: _zod.z.string().optional(),
  status: _zod.z["enum"](["available", "low", "reserved", "damaged", "all"]).optional()
});
var updateInventorySchema = _zod.z.object({
  status: _zod.z["enum"](["available", "low", "reserved", "damaged"]).optional(),
  quantityAvailable: _zod.z.number().min(0).optional(),
  quantityReserved: _zod.z.number().min(0).optional()
});

// Get inventory items
operationsRouter.get("/inventory", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(req, res) {
    var query, items, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          query = inventoryQuerySchema.parse(req.query);
          _context.n = 1;
          return operationsService.getInventory(query);
        case 1:
          items = _context.v;
          res.json({
            items: items
          });
          _context.n = 4;
          break;
        case 2:
          _context.p = 2;
          _t = _context.v;
          if (!(_t instanceof _zod.z.ZodError)) {
            _context.n = 3;
            break;
          }
          res.status(400).json({
            error: _t.flatten()
          });
          return _context.a(2);
        case 3:
          console.error("Failed to fetch inventory:", _t);
          res.status(500).json({
            error: "Failed to fetch inventory"
          });
        case 4:
          return _context.a(2);
      }
    }, _callee, null, [[0, 2]]);
  }));
  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
}());

// Get inventory item by ID
operationsRouter.get("/inventory/:id", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(req, res) {
    var item, _t2;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          _context2.p = 0;
          _context2.n = 1;
          return operationsService.getInventoryItem(req.params.id);
        case 1:
          item = _context2.v;
          res.json({
            item: item
          });
          _context2.n = 4;
          break;
        case 2:
          _context2.p = 2;
          _t2 = _context2.v;
          if (!(_t2 instanceof Error && _t2.message === "Inventory item not found")) {
            _context2.n = 3;
            break;
          }
          res.status(404).json({
            error: _t2.message
          });
          return _context2.a(2);
        case 3:
          console.error("Failed to fetch inventory item:", _t2);
          res.status(500).json({
            error: "Failed to fetch inventory item"
          });
        case 4:
          return _context2.a(2);
      }
    }, _callee2, null, [[0, 2]]);
  }));
  return function (_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
}());

// Update inventory item
operationsRouter.patch("/inventory/:id", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(req, res) {
    var parseResult, item, _t3;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.p = _context3.n) {
        case 0:
          parseResult = updateInventorySchema.safeParse(req.body);
          if (parseResult.success) {
            _context3.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context3.a(2);
        case 1:
          _context3.p = 1;
          _context3.n = 2;
          return operationsService.updateInventoryItem(req.params.id, parseResult.data);
        case 2:
          item = _context3.v;
          res.json({
            item: item
          });
          _context3.n = 5;
          break;
        case 3:
          _context3.p = 3;
          _t3 = _context3.v;
          if (!(_t3 instanceof Error && _t3.message === "Inventory item not found")) {
            _context3.n = 4;
            break;
          }
          res.status(404).json({
            error: _t3.message
          });
          return _context3.a(2);
        case 4:
          console.error("Failed to update inventory item:", _t3);
          res.status(500).json({
            error: "Failed to update inventory item"
          });
        case 5:
          return _context3.a(2);
      }
    }, _callee3, null, [[1, 3]]);
  }));
  return function (_x5, _x6) {
    return _ref3.apply(this, arguments);
  };
}());

// Get fulfillment tasks
operationsRouter.get("/fulfillment", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(req, res) {
    var warehouseCode, tasks, _t4;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          _context4.p = 0;
          warehouseCode = typeof req.query.warehouseCode === "string" ? req.query.warehouseCode : undefined;
          _context4.n = 1;
          return operationsService.getFulfillmentTasks(warehouseCode);
        case 1:
          tasks = _context4.v;
          res.json({
            tasks: tasks
          });
          _context4.n = 3;
          break;
        case 2:
          _context4.p = 2;
          _t4 = _context4.v;
          console.error("Failed to fetch fulfillment tasks:", _t4);
          res.status(500).json({
            error: "Failed to fetch fulfillment tasks"
          });
        case 3:
          return _context4.a(2);
      }
    }, _callee4, null, [[0, 2]]);
  }));
  return function (_x7, _x8) {
    return _ref4.apply(this, arguments);
  };
}());

// Advance fulfillment task
operationsRouter.post("/fulfillment/:id/advance", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(req, res) {
    var task, statusCode, _t5;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.p = _context5.n) {
        case 0:
          _context5.p = 0;
          _context5.n = 1;
          return operationsService.advanceFulfillmentTask(req.params.id);
        case 1:
          task = _context5.v;
          res.json({
            task: task
          });
          _context5.n = 4;
          break;
        case 2:
          _context5.p = 2;
          _t5 = _context5.v;
          if (!(_t5 instanceof Error)) {
            _context5.n = 3;
            break;
          }
          statusCode = _t5.message.includes("not found") ? 404 : 400;
          res.status(statusCode).json({
            error: _t5.message
          });
          return _context5.a(2);
        case 3:
          console.error("Failed to advance fulfillment task:", _t5);
          res.status(500).json({
            error: "Failed to advance fulfillment task"
          });
        case 4:
          return _context5.a(2);
      }
    }, _callee5, null, [[0, 2]]);
  }));
  return function (_x9, _x0) {
    return _ref5.apply(this, arguments);
  };
}());

// Get warehouses summary
operationsRouter.get("/warehouses", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(_req, res) {
    var warehouses, _t6;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.p = _context6.n) {
        case 0:
          _context6.p = 0;
          _context6.n = 1;
          return operationsService.getWarehouses();
        case 1:
          warehouses = _context6.v;
          res.json({
            warehouses: warehouses
          });
          _context6.n = 3;
          break;
        case 2:
          _context6.p = 2;
          _t6 = _context6.v;
          console.error("Failed to fetch warehouses:", _t6);
          res.status(500).json({
            error: "Failed to fetch warehouses"
          });
        case 3:
          return _context6.a(2);
      }
    }, _callee6, null, [[0, 2]]);
  }));
  return function (_x1, _x10) {
    return _ref6.apply(this, arguments);
  };
}());