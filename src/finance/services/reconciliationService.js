const ReconciliationException = require('../models/ReconciliationException');
const ReconciliationRun = require('../models/ReconciliationRun');
const LiveTransaction = require('../models/LiveTransaction');
const logger = require('../../utils/logger');

class ReconciliationService {
  async getReconSummary(date) {
    try {
      const targetDate = date ? new Date(date) : new Date();
      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const gateways = await LiveTransaction.distinct('gateway');

      const summary = await Promise.all(
        gateways.map(async (gateway) => {
          const transactions = await LiveTransaction.find({
            gateway,
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'success',
          }).lean();

          const matchedAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
          const pendingTransactions = await LiveTransaction.countDocuments({
            gateway,
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'pending',
          });
          const pendingAmount = pendingTransactions * 100; // Mock calculation

          const exceptions = await ReconciliationException.countDocuments({
            gateway,
            status: { $in: ['open', 'in_review'] },
          });
          const mismatchAmount = exceptions * 50; // Mock calculation

          const total = matchedAmount + pendingAmount;
          const matchPercent = total > 0 ? (matchedAmount / total) * 100 : 100;

          return {
            id: gateway.toLowerCase().replace(/\s+/g, '_'),
            gateway,
            matchedAmount,
            pendingAmount,
            mismatchAmount,
            status: matchPercent >= 99 ? 'matched' : matchPercent >= 95 ? 'pending' : 'mismatch',
            matchPercent: Math.round(matchPercent * 100) / 100,
            lastRunAt: new Date().toISOString(),
          };
        })
      );

      return summary;
    } catch (error) {
      logger.error('Error fetching reconciliation summary:', error);
      throw error;
    }
  }

  async getExceptions(status = 'open') {
    try {
      const query = status === 'all' ? {} : { status };
      if (status === 'open') {
        query.status = { $in: ['open', 'in_review'] };
      }

      const exceptions = await ReconciliationException.find(query)
        .sort({ createdAt: -1 })
        .lean();

      return exceptions.map(ex => ({
        id: ex._id.toString(),
        ...ex,
      }));
    } catch (error) {
      logger.error('Error fetching exceptions:', error);
      throw error;
    }
  }

  async runReconciliation(date, gateways) {
    try {
      const run = new ReconciliationRun({
        startedAt: new Date(),
        status: 'running',
        period: {
          from: new Date(date),
          to: new Date(date),
        },
        gateways,
      });
      await run.save();

      // In a real implementation, this would trigger an async job
      // For now, we'll simulate it completing immediately
      setTimeout(async () => {
        run.status = 'success';
        run.finishedAt = new Date();
        await run.save();
      }, 1000);

      return {
        id: run._id.toString(),
        startedAt: run.startedAt,
        status: run.status,
        period: run.period,
        gateways: run.gateways,
      };
    } catch (error) {
      logger.error('Error running reconciliation:', error);
      throw error;
    }
  }

  async getRunStatus(id) {
    try {
      const run = await ReconciliationRun.findById(id).lean();
      if (!run) {
        throw new Error('Reconciliation run not found');
      }
      return {
        id: run._id.toString(),
        ...run,
      };
    } catch (error) {
      logger.error('Error fetching run status:', error);
      throw error;
    }
  }

  async investigateException(id) {
    try {
      const exception = await ReconciliationException.findByIdAndUpdate(
        id,
        { $set: { status: 'in_review' } },
        { new: true, runValidators: true }
      ).lean();

      if (!exception) {
        throw new Error('Exception not found');
      }

      return {
        id: exception._id.toString(),
        ...exception,
      };
    } catch (error) {
      logger.error('Error investigating exception:', error);
      throw error;
    }
  }

  async resolveException(id, resolutionType, note) {
    try {
      const updateData = { status: 'resolved' };
      if (note) {
        const exception = await ReconciliationException.findById(id).lean();
        updateData.details = exception
          ? `${exception.details || ''}\nResolution Note: ${note}`
          : note;
      }

      const exception = await ReconciliationException.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      ).lean();

      if (!exception) {
        throw new Error('Exception not found');
      }

      return {
        id: exception._id.toString(),
        ...exception,
      };
    } catch (error) {
      logger.error('Error resolving exception:', error);
      throw error;
    }
  }

  async getGatewayDetails(gatewayId) {
    try {
      const summary = await this.getReconSummary();
      const gateway = summary.find(s => s.id === gatewayId);
      if (!gateway) {
        throw new Error('Gateway not found');
      }
      return gateway;
    } catch (error) {
      logger.error('Error fetching gateway details:', error);
      throw error;
    }
  }
}

module.exports = new ReconciliationService();

