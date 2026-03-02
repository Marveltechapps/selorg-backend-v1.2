const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDPickIssue = require('../../models/PickIssue.model');
const HHDInventory = require('../../models/Inventory.model');
const HHDItem = require('../../models/Item.model');
const HHDTask = require('../../models/Task.model');
const notFoundImpactService = require('../../services/notFoundImpactService');
const {
  PICK_ISSUE_TYPE,
  INVENTORY_STATUS,
  ITEM_STATUS_EXTENDED,
  TASK_STATUS,
  TASK_PRIORITY,
  PICK_NEXT_ACTION,
} = require('../../utils/constants');

async function reportIssue(req, res, next) {
  try {
    const userId = req.user?.id;
    const { orderId, sku, binId, issueType, deviceId } = req.body;
    if (!orderId || !sku || !binId || !issueType) {
      throw new ErrorResponse('Please provide orderId, sku, binId, and issueType', 400);
    }
    if (!Object.values(PICK_ISSUE_TYPE).includes(issueType)) {
      throw new ErrorResponse('Invalid issue type', 400);
    }
    const orderItem = await HHDItem.findOne({ orderId, itemCode: sku });
    if (!orderItem) throw new ErrorResponse('Order item not found', 404);

    const pickIssue = await HHDPickIssue.create({
      orderId,
      sku,
      binId,
      issueType,
      reportedBy: userId,
      deviceId: deviceId || undefined,
    });

    let nextAction = PICK_NEXT_ACTION.SKIP_ITEM;
    let alternateBinId = null;
    let itemStatus = ITEM_STATUS_EXTENDED.SHORT;

    switch (issueType) {
      case PICK_ISSUE_TYPE.ITEM_DAMAGED: {
        await HHDInventory.updateOne(
          { sku, binId },
          { $set: { status: INVENTORY_STATUS.DAMAGED }, $inc: { quantity: -1 } },
          { upsert: false }
        );
        const alternateBin = await HHDInventory.findOne({
          sku,
          status: INVENTORY_STATUS.AVAILABLE,
          quantity: { $gt: 0 },
          binId: { $ne: binId },
        }).sort({ quantity: -1 });
        if (alternateBin) {
          nextAction = PICK_NEXT_ACTION.ALTERNATE_BIN;
          alternateBinId = alternateBin.binId;
          itemStatus = ITEM_STATUS_EXTENDED.REASSIGNED;
        }
        break;
      }
      case PICK_ISSUE_TYPE.ITEM_MISSING: {
        // Decrement stock in reported bin (item was expected but not found)
        await HHDInventory.updateOne(
          { sku, binId, quantity: { $gt: 0 } },
          { $inc: { quantity: -1 } },
          { upsert: false }
        );
        await HHDTask.create({
          title: `Bin Audit Required: ${binId}`,
          description: `Item ${sku} reported as missing in bin ${binId} for order ${orderId}`,
          userId,
          orderId,
          status: TASK_STATUS.PENDING,
          priority: TASK_PRIORITY.HIGH,
        });
        const alternateBin = await HHDInventory.findOne({
          sku,
          status: INVENTORY_STATUS.AVAILABLE,
          quantity: { $gt: 0 },
          binId: { $ne: binId },
        }).sort({ quantity: -1 });
        if (alternateBin) {
          nextAction = PICK_NEXT_ACTION.ALTERNATE_BIN;
          alternateBinId = alternateBin.binId;
          itemStatus = ITEM_STATUS_EXTENDED.REASSIGNED;
        } else {
          // No alternate bin: flag refund and emit catalog sync (stock already decremented above)
          await notFoundImpactService.applyNotFoundImpact({
            orderId,
            sku,
            binId: null,
            notes: `Item ${sku} missing in bin ${binId} (ITEM_MISSING report)`,
            skipInventoryDecrement: true,
          });
        }
        break;
      }
      case PICK_ISSUE_TYPE.ITEM_EXPIRED: {
        await HHDInventory.updateOne(
          { sku, binId },
          { $set: { status: INVENTORY_STATUS.EXPIRED } },
          { upsert: false }
        );
        const freshBatch = await HHDInventory.findOne({
          sku,
          status: INVENTORY_STATUS.AVAILABLE,
          quantity: { $gt: 0 },
          $or: [{ expiryDate: { $gte: new Date() } }, { expiryDate: { $exists: false } }],
          binId: { $ne: binId },
        }).sort({ expiryDate: 1 });
        if (freshBatch) {
          nextAction = PICK_NEXT_ACTION.ALTERNATE_BIN;
          alternateBinId = freshBatch.binId;
          itemStatus = ITEM_STATUS_EXTENDED.REASSIGNED;
        }
        break;
      }
      case PICK_ISSUE_TYPE.WRONG_ITEM: {
        await HHDTask.create({
          title: `Bin Correction Required: ${binId}`,
          description: `Wrong item found in bin ${binId} for order ${orderId}. Expected: ${sku}`,
          userId,
          orderId,
          status: TASK_STATUS.PENDING,
          priority: TASK_PRIORITY.URGENT,
        });
        const alternateBin = await HHDInventory.findOne({
          sku,
          status: INVENTORY_STATUS.AVAILABLE,
          quantity: { $gt: 0 },
          binId: { $ne: binId },
        }).sort({ quantity: -1 });
        if (alternateBin) {
          nextAction = PICK_NEXT_ACTION.ALTERNATE_BIN;
          alternateBinId = alternateBin.binId;
          itemStatus = ITEM_STATUS_EXTENDED.REASSIGNED;
        }
        break;
      }
    }

    orderItem.status = itemStatus;
    if (alternateBinId) orderItem.location = alternateBinId;
    await orderItem.save();

    const response = { success: true, data: { pickIssueId: pickIssue._id, nextAction } };
    if (nextAction === PICK_NEXT_ACTION.ALTERNATE_BIN && alternateBinId) response.data.binId = alternateBinId;
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = { reportIssue };
