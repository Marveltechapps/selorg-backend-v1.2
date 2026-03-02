const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDScannedItem = require('../../models/ScannedItem.model');
const { asyncHandler } = require('../../utils/asyncHandler');

const createScannedItem = asyncHandler(async (req, res, next) => {
  const { barcodeData, barcodeType, orderId, deviceId, metadata } = req.body;
  if (!barcodeData) throw new ErrorResponse('Please provide barcodeData', 400);
  const scannedItem = await HHDScannedItem.create({
    barcodeData,
    barcodeType: barcodeType || 'other',
    orderId: orderId || undefined,
    userId: req.user?.id,
    deviceId: deviceId || undefined,
    metadata: metadata || {},
    scannedAt: new Date(),
  });
  res.status(201).json({ success: true, data: scannedItem });
});

const getScannedItems = asyncHandler(async (req, res, next) => {
  const { orderId, userId, deviceId, barcodeType, startDate, endDate, limit = 50, page = 1 } = req.query;
  const query = {};
  if (orderId) query.orderId = orderId;
  if (userId) query.userId = userId;
  if (deviceId) query.deviceId = deviceId;
  if (barcodeType) query.barcodeType = barcodeType;
  if (startDate || endDate) {
    query.scannedAt = {};
    if (startDate) query.scannedAt.$gte = new Date(startDate);
    if (endDate) query.scannedAt.$lte = new Date(endDate);
  }
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;
  const scannedItems = await HHDScannedItem.find(query).sort({ scannedAt: -1 }).limit(limitNum).skip(skip);
  const total = await HHDScannedItem.countDocuments(query);
  res.status(200).json({
    success: true,
    count: scannedItems.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: scannedItems,
  });
});

const getScannedItem = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const scannedItem = await HHDScannedItem.findById(id);
  if (!scannedItem) throw new ErrorResponse(`Scanned item not found with id of ${id}`, 404);
  res.status(200).json({ success: true, data: scannedItem });
});

module.exports = { createScannedItem, getScannedItems, getScannedItem };
