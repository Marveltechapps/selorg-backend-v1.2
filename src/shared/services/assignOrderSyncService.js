/**
 * Syncs darkstore order assignment to HHD/Picker - creates HHDOrder, assignorder, and HHDItems
 * so the picker's HHD device receives the order in real-time.
 */
const mongoose = require('mongoose');
const HHDOrder = require('../../hhd/models/Order.model');
const HHDItem = require('../../hhd/models/Item.model');
const { ORDER_STATUS, ORDER_PRIORITY, ZONE } = require('../../hhd/utils/constants');
const PickerUser = require('../../picker/models/user.model');

/**
 * Resolve HHD user ID from picker ID (PickerUser may have linked hhdUserId)
 */
async function resolveHhdUserId(pickerId) {
  if (!pickerId) return null;
  try {
    const picker = await PickerUser.findById(pickerId).select('hhdUserId').lean();
    return (picker?.hhdUserId && mongoose.Types.ObjectId.isValid(picker.hhdUserId))
      ? new mongoose.Types.ObjectId(picker.hhdUserId)
      : new mongoose.Types.ObjectId(pickerId);
  } catch {
    return new mongoose.Types.ObjectId(pickerId);
  }
}

/**
 * Create HHDOrder, assignorder, and HHDItems when darkstore assigns order to picker
 * @param {object} darkstoreOrder - Darkstore order document (with items, order_id, etc.)
 * @param {string} pickerId - PickerUser _id
 * @returns {Promise<{hhdOrder, assignorder}|null>} Created records or null on error
 */
async function syncAssignOrderToHhd(darkstoreOrder, pickerId) {
  if (!darkstoreOrder || !pickerId) return null;

  const orderId = darkstoreOrder.order_id;
  if (!orderId) return null;

  try {
    const hhdUserId = await resolveHhdUserId(pickerId);
    if (!hhdUserId) return null;

    const existingHhd = await HHDOrder.findOne({ orderId });
    if (existingHhd) {
      // Already synced (e.g. re-assign) - update assignorder if needed
      const assignColl = mongoose.connection.collection('assignorders');
      const existingAssign = await assignColl.findOne({ orderId });
      if (!existingAssign) {
        await assignColl.insertOne({
          orderId,
          userId: hhdUserId,
          status: 'pending',
          storeId: darkstoreOrder.store_id,
          itemCount: darkstoreOrder.item_count || 0,
          items: darkstoreOrder.items || [],
          zone: darkstoreOrder.zone || ZONE.A,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return { hhdOrder: existingHhd, assignorder: await assignColl.findOne({ orderId }) };
    }

    const zone = darkstoreOrder.zone || ZONE.A;
    const targetTime = 15; // SLA in minutes

    const hhdOrder = await HHDOrder.create({
      orderId,
      userId: hhdUserId,
      zone,
      itemCount: darkstoreOrder.item_count || 1,
      targetTime,
      priority: ORDER_PRIORITY.HIGH,
      status: ORDER_STATUS.PENDING,
      startedAt: new Date(),
    });

    const assignColl = mongoose.connection.collection('assignorders');
    const assignDoc = {
      orderId,
      userId: hhdUserId,
      status: 'pending',
      storeId: darkstoreOrder.store_id,
      itemCount: darkstoreOrder.item_count || 0,
      items: darkstoreOrder.items || [],
      zone,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await assignColl.insertOne(assignDoc);

    const items = darkstoreOrder.items || [];
    if (items.length > 0) {
      const itemDocs = items.map((it, idx) => ({
        orderId,
        itemCode: it.sku || it.productId || `item-${idx}`,
        name: it.productName || 'Item',
        quantity: it.quantity || 1,
        category: it.category || 'Grocery',
        status: 'pending',
      }));
      await HHDItem.insertMany(itemDocs);
    }

    return { hhdOrder, assignorder: assignDoc };
  } catch (err) {
    console.warn('assignOrderSyncService: sync failed (non-blocking)', {
      orderId: darkstoreOrder?.order_id,
      pickerId,
      error: err.message,
    });
    return null;
  }
}

module.exports = { syncAssignOrderToHhd, resolveHhdUserId };
