const LiveTransaction = require('../models/LiveTransaction');
const logger = require('../../utils/logger');

class FinanceAnalyticsService {
  async getRevenueGrowth(from, to, granularity = 'month') {
    try {
      const startDate = from ? new Date(from) : new Date();
      startDate.setMonth(startDate.getMonth() - 12);
      const endDate = to ? new Date(to) : new Date();

      const transactions = await LiveTransaction.find({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'success',
      }).lean();

      const dataMap = {};
      transactions.forEach(txn => {
        const dateKey = this.getDateKey(txn.createdAt, granularity);
        if (!dataMap[dateKey]) {
          dataMap[dateKey] = { totalRevenue: 0, newRevenue: 0, churnAmount: 0 };
        }
        dataMap[dateKey].totalRevenue += txn.amount;
        dataMap[dateKey].newRevenue += txn.amount * 0.3; // Mock calculation
      });

      const result = Object.entries(dataMap).map(([date, data]) => ({
        date,
        totalRevenue: Math.round(data.totalRevenue),
        recurringRevenue: Math.round(data.totalRevenue - data.newRevenue),
        newRevenue: Math.round(data.newRevenue),
        churnAmount: Math.round(data.churnAmount || data.totalRevenue * 0.02),
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      return result;
    } catch (error) {
      logger.error('Error fetching revenue growth:', error);
      throw error;
    }
  }

  async getCashFlow(from, to, granularity = 'month') {
    try {
      const startDate = from ? new Date(from) : new Date();
      startDate.setMonth(startDate.getMonth() - 12);
      const endDate = to ? new Date(to) : new Date();

      const transactions = await LiveTransaction.find({
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const dataMap = {};
      transactions.forEach(txn => {
        const dateKey = this.getDateKey(txn.createdAt, granularity);
        if (!dataMap[dateKey]) {
          dataMap[dateKey] = { inflow: 0, outflow: 0 };
        }
        if (txn.status === 'success') {
          dataMap[dateKey].inflow += txn.amount;
        } else {
          dataMap[dateKey].outflow += txn.amount;
        }
      });

      const result = Object.entries(dataMap).map(([date, data], idx) => ({
        date,
        inflow: Math.round(data.inflow),
        outflow: Math.round(data.outflow),
        net: Math.round(data.inflow - data.outflow),
        projected: idx >= 10 ? Math.round((data.inflow - data.outflow) * 1.1) : undefined,
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      return result;
    } catch (error) {
      logger.error('Error fetching cash flow:', error);
      throw error;
    }
  }

  async getExpenseBreakdown(from, to, granularity = 'month') {
    try {
      const startDate = from ? new Date(from) : new Date();
      startDate.setMonth(startDate.getMonth() - 12);
      const endDate = to ? new Date(to) : new Date();

      const categories = [
        { name: 'Vendor Payments', color: '#3B82F6' },
        { name: 'Operations', color: '#10B981' },
        { name: 'Payroll', color: '#F59E0B' },
        { name: 'Marketing', color: '#8B5CF6' },
        { name: 'Overheads', color: '#6B7280' },
      ];

      const dataMap = {};
      for (let i = 0; i < 12; i++) {
        const date = new Date(startDate);
        date.setMonth(date.getMonth() + i);
        const dateKey = this.getDateKey(date, granularity);
        dataMap[dateKey] = categories.map(cat => ({
          name: cat.name,
          amount: Math.round(10000 + Math.random() * 15000),
          color: cat.color,
        }));
      }

      const result = Object.entries(dataMap).map(([date, categories]) => ({
        date,
        categories,
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      return result;
    } catch (error) {
      logger.error('Error fetching expense breakdown:', error);
      throw error;
    }
  }

  async exportAnalyticsReport(request) {
    try {
      const reportUrl = `https://reports.example.com/analytics/${request.metric}-${Date.now()}.${request.format}`;
      return { url: reportUrl };
    } catch (error) {
      logger.error('Error exporting analytics report:', error);
      throw error;
    }
  }

  getDateKey(date, granularity) {
    if (granularity === 'month') {
      return date.toLocaleString('default', { month: 'short', year: 'numeric' });
    } else {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `Q${quarter} ${date.getFullYear()}`;
    }
  }
}

module.exports = new FinanceAnalyticsService();

