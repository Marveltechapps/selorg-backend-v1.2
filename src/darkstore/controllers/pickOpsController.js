/**
 * Pick & Pack Ops Controller
 * GET /api/v1/darkstore/pick-ops — returns orders with status PICKING or ASSIGNED
 */
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../../constants/pickerEnums');

async function getPickOps(req, res) {
  try {
    const storeId = req.query.storeId;

    const query = { status: { $in: [ORDER_STATUS.PICKING, ORDER_STATUS.ASSIGNED] } };
    if (storeId) query.store_id = storeId;

    const orders = await Order.find(query)
      .sort({ 'pickingData.startTime': 1, sla_deadline: 1 })
      .lean();

    const data = orders.map((o) => {
      const pd = o.pickingData || {};
      const pa = o.pickerAssignment || {};
      const itemCount = o.item_count || 0;
      const missingCount = (pd.missingItems && pd.missingItems.length) || 0;
      let progress = 0;
      if (o.status === ORDER_STATUS.PICKING) {
        if (itemCount > 0 && missingCount > 0) {
          progress = Math.round(((itemCount - missingCount) / itemCount) * 100);
        } else if (itemCount > 0) {
          progress = pd.accuracy != null ? pd.accuracy : 50; // in progress placeholder
        }
      }

      return {
        orderId: o.order_id,
        pickerName: pa.pickerName || (o.assignee && o.assignee.name) || '—',
        startedAt: pd.startTime || pa.assignedAt || o.updatedAt,
        progress,
        missingItemsCount: missingCount,
        slaRisk: o.sla_status || 'safe',
        zone: o.store_id || '—',
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pick ops',
    });
  }
}

module.exports = { getPickOps };
