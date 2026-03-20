const Document = require('../models/Document');
const RiderHR = require('../models/RiderHR');
const { Rider: RiderV2 } = require('../../rider_v2_backend/src/models/Rider');
const logger = require('../../core/utils/logger');

const getHrDashboardSummary = async () => {
  try {
    // Count pending documents from RiderV2
    const v2PendingCountResults = await RiderV2.aggregate([
      { $project: { docs: { $objectToArray: "$documents" } } },
      { $unwind: "$docs" },
      { $match: { "docs.v.status": "pending", "docs.v.documentUrl": { $exists: true, $ne: null } } },
      { $count: "count" }
    ]);
    const v2PendingCount = v2PendingCountResults.length > 0 ? v2PendingCountResults[0].count : 0;

    const [pendingVerifications, expiredDocuments, activeCompliantRiders] = await Promise.all([
      Document.countDocuments({ status: { $in: ['pending', 'resubmitted'] } }),
      Document.countDocuments({ status: 'expired' }),
      // Count all compliant riders (active, onboarding, etc.) - not just active ones
      RiderHR.countDocuments({ 
        'compliance.isCompliant': true 
      }),
    ]);

    return {
      pendingVerifications: pendingVerifications + v2PendingCount,
      expiredDocuments,
      activeCompliantRiders, // This now represents all compliant riders
    };
  } catch (error) {
    logger.error('Error getting HR dashboard summary:', error);
    throw error;
  }
};

module.exports = {
  getHrDashboardSummary,
};

