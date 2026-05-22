const LiveTransaction = require('../models/LiveTransaction');
const VendorInvoice = require('../models/VendorInvoice');
const { buildEntityFilter, isReceivedTxn } = require('../utils/financeEntityScope');
const { exportPnLReport } = require('./pnlExportService');
const logger = require('../../utils/logger');

class FinanceAnalyticsService {
  async getRevenueGrowth(from, to, granularity = 'month') {
    try {
      const start = from ? new Date(from) : new Date();
      start.setHours(0, 0, 0, 0);
      if (!to) start.setMonth(start.getMonth() - 12);
      const end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);

      const transactions = await LiveTransaction.find({
        createdAt: { $gte: start, $lte: end },
        status: { $in: ['success', 'pending'] },
      }).lean();

      const dataMap = {};
      transactions.forEach((txn) => {
        const dateKey = this.getDateKey(txn.createdAt, granularity);
        if (!dataMap[dateKey]) {
          dataMap[dateKey] = { totalRevenue: 0, newRevenue: 0, churnAmount: 0 };
        }
        if (isReceivedTxn(txn)) {
          dataMap[dateKey].totalRevenue += txn.amount || 0;
          dataMap[dateKey].newRevenue += txn.amount || 0;
        }
      });

      return Object.entries(dataMap)
        .map(([date, data]) => ({
          date,
          totalRevenue: Math.round(data.totalRevenue),
          recurringRevenue: Math.round(Math.max(0, data.totalRevenue - data.newRevenue * 0.7)),
          newRevenue: Math.round(data.newRevenue),
          churnAmount: Math.round(data.churnAmount),
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
      logger.error('Error fetching revenue growth:', error);
      throw error;
    }
  }

  async getCashFlow(from, to, granularity = 'month') {
    try {
      const start = from ? new Date(from) : new Date();
      start.setHours(0, 0, 0, 0);
      if (!to) start.setMonth(start.getMonth() - 12);
      const end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);

      const RefundRequest = require('../models/RefundRequest');
      const [transactions, refunds] = await Promise.all([
        LiveTransaction.find({ createdAt: { $gte: start, $lte: end } }).lean(),
        RefundRequest.find({
          status: { $in: ['processed', 'completed'] },
          $or: [
            { processedAt: { $gte: start, $lte: end } },
            { completedAt: { $gte: start, $lte: end } },
          ],
        }).lean(),
      ]);

      const dataMap = {};
      transactions.forEach((txn) => {
        const dateKey = this.getDateKey(txn.createdAt, granularity);
        if (!dataMap[dateKey]) dataMap[dateKey] = { inflow: 0, outflow: 0 };
        if (isReceivedTxn(txn)) dataMap[dateKey].inflow += txn.amount || 0;
        else if (txn.status === 'failed') dataMap[dateKey].outflow += txn.amount || 0;
      });

      refunds.forEach((r) => {
        const d = r.processedAt || r.completedAt || r.updatedAt;
        const dateKey = this.getDateKey(d, granularity);
        if (!dataMap[dateKey]) dataMap[dateKey] = { inflow: 0, outflow: 0 };
        dataMap[dateKey].outflow += r.amount || 0;
      });

      return Object.entries(dataMap)
        .map(([date, data]) => ({
          date,
          inflow: Math.round(data.inflow),
          outflow: Math.round(data.outflow),
          net: Math.round(data.inflow - data.outflow),
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
      logger.error('Error fetching cash flow:', error);
      throw error;
    }
  }

  async getExpenseBreakdown(from, to, granularity = 'month') {
    try {
      const start = from ? new Date(from) : new Date();
      start.setHours(0, 0, 0, 0);
      if (!to) start.setMonth(start.getMonth() - 12);
      const end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);

      const invoices = await VendorInvoice.find({
        status: { $in: ['approved', 'scheduled', 'paid'] },
        invoiceDate: { $gte: start, $lte: end },
      }).lean();

      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#6B7280', '#EF4444'];
      const dataMap = {};

      invoices.forEach((inv) => {
        const dateKey = this.getDateKey(inv.invoiceDate || inv.createdAt, granularity);
        if (!dataMap[dateKey]) dataMap[dateKey] = {};
        const vendor = inv.vendorName || 'Other Vendors';
        dataMap[dateKey][vendor] = (dataMap[dateKey][vendor] || 0) + (inv.amount || 0);
      });

      return Object.entries(dataMap)
        .map(([date, vendorAmounts]) => {
          const categories = Object.entries(vendorAmounts).map(([name, amount], idx) => ({
            name,
            amount: Math.round(amount),
            color: colors[idx % colors.length],
          }));
          return { date, categories };
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
      logger.error('Error fetching expense breakdown:', error);
      throw error;
    }
  }

  async exportAnalyticsReport(request) {
    try {
      if (request.metric === 'pnl') {
        return exportPnLReport(request);
      }
      throw new Error(`Export not supported for metric: ${request.metric}`);
    } catch (error) {
      logger.error('Error exporting analytics report:', error);
      throw error;
    }
  }

  getDateKey(date, granularity) {
    const d = new Date(date);
    if (granularity === 'month') {
      return d.toLocaleString('default', { month: 'short', year: 'numeric' });
    }
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    return `Q${quarter} ${d.getFullYear()}`;
  }
}

module.exports = new FinanceAnalyticsService();
