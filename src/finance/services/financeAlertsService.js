const FinanceAlert = require('../models/FinanceAlert');
const logger = require('../../utils/logger');

class FinanceAlertsService {
  async getAlerts(status = 'open') {
    try {
      const query = status === 'all' ? {} : { status };
      if (status === 'open') {
        query.status = { $in: ['open', 'in_progress', 'acknowledged'] };
      }

      const alerts = await FinanceAlert.find(query)
        .sort({ createdAt: -1 })
        .lean();

      return alerts.map(alert => ({
        id: alert._id.toString(),
        ...alert,
      }));
    } catch (error) {
      logger.error('Error fetching alerts:', error);
      throw error;
    }
  }

  async getAlertDetails(id) {
    try {
      const alert = await FinanceAlert.findById(id).lean();
      if (!alert) {
        return null;
      }
      return {
        id: alert._id.toString(),
        ...alert,
      };
    } catch (error) {
      logger.error('Error fetching alert details:', error);
      throw error;
    }
  }

  async performAlertAction(id, payload) {
    try {
      const alert = await FinanceAlert.findById(id);
      if (!alert) {
        throw new Error('Alert not found');
      }

      let newStatus = alert.status;
      switch (payload.actionType) {
        case 'dismiss':
          newStatus = 'dismissed';
          break;
        case 'resolve':
          newStatus = 'resolved';
          break;
        case 'acknowledge':
          newStatus = 'acknowledged';
          break;
        case 'check_gateway':
        case 'review_txn':
        case 'reconcile':
          newStatus = 'in_progress';
          break;
      }

      alert.status = newStatus;
      alert.lastUpdatedAt = new Date();
      await alert.save();

      return {
        id: alert._id.toString(),
        ...alert.toObject(),
      };
    } catch (error) {
      logger.error('Error performing alert action:', error);
      throw error;
    }
  }

  async clearResolvedAlerts() {
    try {
      await FinanceAlert.deleteMany({
        status: { $in: ['resolved', 'dismissed'] },
      });
      return { success: true };
    } catch (error) {
      logger.error('Error clearing resolved alerts:', error);
      throw error;
    }
  }
}

module.exports = new FinanceAlertsService();

