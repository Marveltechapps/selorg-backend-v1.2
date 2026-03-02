const Document = require('../models/Document');
const RiderHR = require('../models/RiderHR');
const logger = require('../../core/utils/logger');

const getHrDashboardSummary = async () => {
  try {
    const [pendingVerifications, expiredDocuments, activeCompliantRiders] = await Promise.all([
      Document.countDocuments({ status: { $in: ['pending', 'resubmitted'] } }),
      Document.countDocuments({ status: 'expired' }),
      // Count all compliant riders (active, onboarding, etc.) - not just active ones
      RiderHR.countDocuments({ 
        'compliance.isCompliant': true 
      }),
    ]);

    return {
      pendingVerifications,
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

