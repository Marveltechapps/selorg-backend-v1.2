'use strict';

const { asyncHandler } = require('../../core/middleware');
const logisticsService = require('../services/logistics.service');

const createOrder = asyncHandler(async (req, res) => {
  const order = await logisticsService.createOrder(req.validatedBody, {
    enforcedType: req.logisticsScopeType,
  });
  res.status(201).json({ success: true, data: order });
});

const listOrders = asyncHandler(async (req, res) => {
  const out = await logisticsService.listOrders(req.validatedQuery, {
    enforcedType: req.logisticsScopeType,
  });
  res.json({ success: true, data: out.items, meta: { total: out.total, page: out.page, limit: out.limit } });
});

const getOrder = asyncHandler(async (req, res) => {
  const data = await logisticsService.getOrderById(req.params.id, {
    enforcedType: req.logisticsScopeType,
  });
  res.json({ success: true, data });
});

const cancelOrder = asyncHandler(async (req, res) => {
  const data = await logisticsService.cancelOrder(req.params.id, {
    enforcedType: req.logisticsScopeType,
  });
  res.json({ success: true, data });
});

const getTracking = asyncHandler(async (req, res) => {
  const data = await logisticsService.getTracking(req.params.id, {
    enforcedType: req.logisticsScopeType,
  });
  res.json({ success: true, data });
});

module.exports = { createOrder, listOrders, getOrder, cancelOrder, getTracking };
