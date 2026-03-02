const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDRack = require('../../models/Rack.model');
const HHDOrder = require('../../models/Order.model');
const HHDCompletedOrder = require('../../models/CompletedOrder.model');
const { ORDER_STATUS } = require('../../utils/constants');

function parseRackQR(qrCode) {
  const trimmed = qrCode.trim();
  const fullPattern = /^Rack-([A-Z0-9]+)-Slot(\d+)\s*\(([^)]+)\)$/i;
  const match = trimmed.match(fullPattern);
  if (!match) {
    throw new ErrorResponse(
      'Invalid rack QR code format. Expected format: Rack-{identifier}-Slot{number} ({rider name}). Example: Rack-D1-Slot3 (John Doe)',
      400
    );
  }
  const rackIdentifier = match[1].toUpperCase();
  const slotNumber = parseInt(match[2], 10);
  const riderName = match[3].trim();
  if (isNaN(slotNumber) || slotNumber < 1) throw new ErrorResponse('Invalid slot number in QR code', 400);
  if (!riderName || riderName.length === 0) throw new ErrorResponse('Rider name is required in QR code format', 400);
  const rackCode = `Rack-${rackIdentifier}-Slot${slotNumber}`;
  return { rackIdentifier, slotNumber, riderName, rackCode };
}

async function scanRack(req, res, next) {
  try {
    const { qrCode, orderId, riderId, pickTime } = req.body;
    if (!qrCode || !orderId) throw new ErrorResponse('Please provide qrCode and orderId', 400);
    const { rackIdentifier, slotNumber, riderName, rackCode: parsedRackCode } = parseRackQR(qrCode);
    let rack = await HHDRack.findOne({ rackIdentifier, slotNumber });
    if (!rack) {
      const zone = rackIdentifier.charAt(0);
      rack = await HHDRack.create({
        rackCode: parsedRackCode,
        rackIdentifier,
        slotNumber,
        location: `${rackIdentifier}-Slot${slotNumber}`,
        zone: `Zone ${zone}`,
        isAvailable: true,
      });
    }
    if (!rack.isAvailable) {
      throw new ErrorResponse(
        `Rack ${parsedRackCode} is not available. Currently assigned to order ${rack.currentOrderId}`,
        400
      );
    }
    rack.isAvailable = false;
    rack.currentOrderId = orderId;
    rack.riderName = riderName;
    if (riderId) rack.riderId = riderId;
    rack.assignedAt = new Date();
    await rack.save();

    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse('User ID is required', 401);
    const order = await HHDOrder.findOne({ orderId, userId });

    if (order) {
      let calculatedPickTime = pickTime;
      if (!calculatedPickTime && order.startedAt) {
        const startTime = new Date(order.startedAt).getTime();
        const completedTime = new Date().getTime();
        calculatedPickTime = Math.round((completedTime - startTime) / 60000);
      } else if (!calculatedPickTime && order.pickTime) {
        calculatedPickTime = order.pickTime;
      }
      order.status = ORDER_STATUS.COMPLETED;
      order.completedAt = new Date();
      order.rackLocation = parsedRackCode;
      order.riderName = riderName;
      if (riderId) order.riderId = riderId;
      if (calculatedPickTime) order.pickTime = calculatedPickTime;
      await order.save();

      const completedOrderData = {
        orderId: order.orderId,
        userId: order.userId,
        zone: order.zone,
        status: ORDER_STATUS.COMPLETED,
        itemCount: order.itemCount,
        targetTime: order.targetTime,
        pickTime: calculatedPickTime || order.pickTime,
        bagId: order.bagId,
        rackLocation: parsedRackCode,
        riderName,
        riderId: riderId || order.riderId,
        startedAt: order.startedAt,
        completedAt: new Date(),
        rackAssignedAt: new Date(),
        createdAt: order.createdAt,
        updatedAt: new Date(),
      };
      const existingCompletedOrder = await HHDCompletedOrder.findOne({ orderId });
      if (!existingCompletedOrder) await HHDCompletedOrder.create(completedOrderData);
      await HHDOrder.deleteOne({ orderId, userId });
    }

    res.status(200).json({
      success: true,
      data: rack,
      message: 'Rack scanned and assigned successfully. Order moved to Completed Orders.',
    });
  } catch (error) {
    next(error);
  }
}

async function getRack(req, res, next) {
  try {
    const { rackCode } = req.params;
    const rack = await HHDRack.findOne({ rackCode });
    if (!rack) throw new ErrorResponse(`Rack not found with code ${rackCode}`, 404);
    res.status(200).json({ success: true, data: rack });
  } catch (error) {
    next(error);
  }
}

async function getAvailableRacks(req, res, next) {
  try {
    const { zone } = req.query;
    const query = { isAvailable: true };
    if (zone) query.zone = zone;
    const racks = await HHDRack.find(query);
    res.status(200).json({ success: true, count: racks.length, data: racks });
  } catch (error) {
    next(error);
  }
}

module.exports = { scanRack, getRack, getAvailableRacks };
