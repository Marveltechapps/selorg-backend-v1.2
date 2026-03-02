const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDItem = require('../../models/Item.model');
const { ITEM_STATUS } = require('../../utils/constants');
const notFoundImpactService = require('../../services/notFoundImpactService');
const substituteSuggestionService = require('../../services/substituteSuggestionService');

async function getOrderItems(req, res, next) {
  try {
    const { orderId } = req.params;
    const { status } = req.query;
    const query = { orderId };
    if (status) query.status = status;
    const items = await HHDItem.find(query).sort({ createdAt: 1 });
    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error) {
    next(error);
  }
}

async function scanItem(req, res, next) {
  try {
    const { orderId, itemCode } = req.body;
    if (!orderId || !itemCode) throw new ErrorResponse('Please provide orderId and itemCode', 400);
    const item = await HHDItem.findOne({ orderId, itemCode });
    if (!item) throw new ErrorResponse('Item not found', 404);
    item.status = ITEM_STATUS.SCANNED;
    item.scannedAt = new Date();
    await item.save();
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

async function getSubstitutes(req, res, next) {
  try {
    const { sku } = req.query;
    const { orderId } = req.query;
    const limit = parseInt(req.query.limit, 10) || 5;
    if (!sku) throw new ErrorResponse('sku query parameter is required', 400);

    const suggestions = await substituteSuggestionService.suggestSubstitutes({
      sku,
      orderId: orderId || undefined,
      limit,
    });

    res.status(200).json({ success: true, data: suggestions, count: suggestions.length });
  } catch (error) {
    next(error);
  }
}

async function markItemNotFound(req, res, next) {
  try {
    const { itemId } = req.params;
    const { notes, substituteSku } = req.body;
    const item = await HHDItem.findById(itemId);
    if (!item) throw new ErrorResponse(`Item not found with id of ${itemId}`, 404);

    if (substituteSku) {
      item.status = ITEM_STATUS.SUBSTITUTED;
      item.substituteItemCode = substituteSku;
      if (notes) item.notes = notes;
      await item.save();
      return res.status(200).json({
        success: true,
        data: item,
        meta: { substituted: true, substituteSku, refundFlagged: false },
      });
    }

    item.status = ITEM_STATUS.NOT_FOUND;
    if (notes) item.notes = notes;
    await item.save();

    const impact = await notFoundImpactService.applyNotFoundImpact({
      orderId: item.orderId,
      sku: item.itemCode,
      notes: notes || `Item ${item.itemCode} marked not found`,
    });

    res.status(200).json({
      success: true,
      data: item,
      meta: {
        refundFlagged: !!impact.refund,
        inventoryAdjusted: !!impact.inventory,
        catalogSyncEmitted: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { status, location, notes } = req.body;
    const item = await HHDItem.findById(itemId);
    if (!item) throw new ErrorResponse(`Item not found with id of ${itemId}`, 404);
    if (status) item.status = status;
    if (location) item.location = location;
    if (notes) item.notes = notes;
    await item.save();
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

module.exports = { getOrderItems, scanItem, getSubstitutes, markItemNotFound, updateItem };
