const ReconciliationException = require('../models/ReconciliationException');
const ReconciliationRun = require('../models/ReconciliationRun');
const {
  buildSummaryForDate,
  executeReconciliationRun,
  analyzeGateway,
  mapExceptionDto,
  mapRunDto,
  listGatewayKeys,
  gatewayLabel,
} = require('./reconciliationEngine');
const { buildDayRange } = require('../utils/financeEntityScope');
const { normalizeGatewayKey } = require('../utils/reconciliationGateways');
const logger = require('../../utils/logger');

class ReconciliationService {
  async getAvailableGateways() {
    return listGatewayKeys().map((id) => ({ id, label: gatewayLabel(id) }));
  }

  async getReconSummary(date) {
    try {
      const summary = await buildSummaryForDate(date);
      return summary;
    } catch (error) {
      logger.error('Error fetching reconciliation summary:', error);
      throw error;
    }
  }

  async getExceptions(status = 'open') {
    try {
      const query = {};
      if (status && status !== 'all') {
        query.status = status === 'open' ? { $in: ['open', 'in_review'] } : status;
      }

      const exceptions = await ReconciliationException.find(query)
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      return exceptions.map(mapExceptionDto);
    } catch (error) {
      logger.error('Error fetching exceptions:', error);
      throw error;
    }
  }

  async runReconciliation(date, gateways) {
    try {
      return await executeReconciliationRun(date, gateways);
    } catch (error) {
      logger.error('Error running reconciliation:', error);
      throw error;
    }
  }

  async getRunStatus(id) {
    try {
      const run = await ReconciliationRun.findById(id).lean();
      if (!run) throw new Error('Reconciliation run not found');
      return mapRunDto(run);
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

      if (!exception) throw new Error('Exception not found');
      return mapExceptionDto(exception);
    } catch (error) {
      logger.error('Error investigating exception:', error);
      throw error;
    }
  }

  async resolveException(id, resolutionType, note) {
    try {
      const existing = await ReconciliationException.findById(id).lean();
      if (!existing) throw new Error('Exception not found');

      const details = [
        existing.details || '',
        `Resolution: ${resolutionType}`,
        note ? `Note: ${note}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const exception = await ReconciliationException.findByIdAndUpdate(
        id,
        {
          $set: {
            status: resolutionType === 'ignored' ? 'ignored' : 'resolved',
            details,
            suggestedAction: resolutionType,
          },
        },
        { new: true, runValidators: true }
      ).lean();

      return mapExceptionDto(exception);
    } catch (error) {
      logger.error('Error resolving exception:', error);
      throw error;
    }
  }

  async getGatewayDetails(gatewayId, date) {
    try {
      const key = normalizeGatewayKey(gatewayId);
      const { startDate, endDate } = buildDayRange(date);
      const analysis = await analyzeGateway(key, startDate, endDate, { createExceptions: false });
      const lastRun = await ReconciliationRun.findOne({
        gateways: key,
        status: 'success',
      })
        .sort({ finishedAt: -1 })
        .lean();

      return {
        id: key,
        gateway: analysis.gateway,
        matchedAmount: analysis.matchedAmount,
        pendingAmount: analysis.pendingAmount,
        mismatchAmount: analysis.mismatchAmount,
        status: analysis.status,
        matchPercent: analysis.matchPercent,
        lastRunAt: lastRun?.finishedAt?.toISOString?.() || new Date().toISOString(),
        transactionsChecked: analysis.transactionsChecked,
      };
    } catch (error) {
      logger.error('Error fetching gateway details:', error);
      throw error;
    }
  }
}

module.exports = new ReconciliationService();
