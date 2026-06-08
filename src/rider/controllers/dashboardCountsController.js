const dispatchService = require('../services/dispatchService');
const { Escalation } = require('../../common-models/Escalation');
const Alert = require('../../common-models/Alert');

async function getDashboardCounts(req, res, next) {
  try {
    const hubId = req.query.hubId || req.query.storeId || undefined;

    const [dispatchResult, escalationsCount, alertsCount] = await Promise.all([
      dispatchService.getUnassignedOrdersCount('all').catch(() => ({ count: 0 })),
      Escalation.countDocuments({
        targetTeam: 'rider_ops',
        status: { $in: ['open', 'in_progress', 'pending'] },
        ...(hubId ? { storeId: hubId } : {}),
      }).catch(() => 0),
      Alert.countDocuments({
        status: { $in: ['open', 'active', 'pending'] },
        ...(hubId ? { storeId: hubId } : {}),
      }).catch(() => 0),
    ]);

    const dispatchQueue =
      typeof dispatchResult?.count === 'number'
        ? dispatchResult.count
        : typeof dispatchResult?.data?.count === 'number'
          ? dispatchResult.data.count
          : 0;

    res.json({
      success: true,
      data: {
        dispatchQueue,
        escalations: escalationsCount,
        alerts: alertsCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardCounts };
