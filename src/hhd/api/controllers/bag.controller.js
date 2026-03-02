const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDBag = require('../../models/Bag.model');
const { BAG_STATUS } = require('../../utils/constants');

function parseBagQR(qrCode) {
  const parts = qrCode.split('-');
  if (parts.length < 2) {
    throw new ErrorResponse('Invalid bag QR code format. Expected: BAG-{number}-{size}-{code}', 400);
  }
  const bagId = `${parts[0]}-${parts[1]}`;
  let size; let code;
  if (parts.length >= 3) size = parts[2];
  if (parts.length >= 4) code = parts.slice(3).join('-');
  return { bagId, size, code };
}

async function scanBag(req, res, next) {
  try {
    const { qrCode, orderId } = req.body;
    const userId = req.user?.id;
    if (!qrCode || !orderId) throw new ErrorResponse('Please provide qrCode and orderId', 400);
    const { bagId, size } = parseBagQR(qrCode);
    const existingBag = await HHDBag.findOne({ bagId });
    if (existingBag) {
      throw new ErrorResponse(
        `Bag ${bagId} has already been scanned for order ${existingHHDBag.orderId}. Please scan a different bag.`,
        409
      );
    }
    const bag = await HHDBag.create({
      bagId,
      orderId,
      userId,
      size,
      status: BAG_STATUS.SCANNED,
      scannedAt: new Date(),
    });
    res.status(201).json({ success: true, data: bag, message: 'Bag scanned successfully' });
  } catch (error) {
    next(error);
  }
}

async function updateBag(req, res, next) {
  try {
    const { bagId } = req.params;
    const { status, photoUrl } = req.body;
    const bag = await HHDBag.findOne({ bagId });
    if (!bag) throw new ErrorResponse(`Bag not found with id of ${bagId}`, 404);
    if (status) bag.status = status;
    if (photoUrl) bag.photoUrl = photoUrl;
    await bag.save();
    res.status(200).json({ success: true, data: bag });
  } catch (error) {
    next(error);
  }
}

async function getBag(req, res, next) {
  try {
    const { bagId } = req.params;
    const bag = await HHDBag.findOne({ bagId });
    if (!bag) throw new ErrorResponse(`Bag not found with id of ${bagId}`, 404);
    res.status(200).json({ success: true, data: bag });
  } catch (error) {
    next(error);
  }
}

module.exports = { scanBag, updateBag, getBag };
