const FinanceSummary = require('../models/FinanceSummary');
const LiveTransaction = require('../models/LiveTransaction');
const logger = require('../../utils/logger');

class FinanceDashboardService {
  async getFinanceSummary(entityId, date) {
    try {
      // Compute dynamic summary from transactions and invoices to ensure calculated fields are accurate
      const target = date ? new Date(date) : new Date();
      const startDate = new Date(target);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(target);
      endDate.setUTCHours(23, 59, 59, 999);

      // Today's transactions
      const todaysTxns = await LiveTransaction.find({
        entityId,
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const totalReceivedToday = todaysTxns
        .filter(t => t.status === 'success')
        .reduce((s, t) => s + (t.amount || 0), 0);

      // Previous day
      const prevStart = new Date(startDate);
      prevStart.setUTCDate(prevStart.getUTCDate() - 1);
      const prevEnd = new Date(endDate);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      const prevTxns = await LiveTransaction.find({
        entityId,
        createdAt: { $gte: prevStart, $lte: prevEnd },
      }).lean();
      const totalPrev = prevTxns.filter(t => t.status === 'success').reduce((s, t) => s + (t.amount || 0), 0);

      const totalReceivedChangePercent = totalPrev > 0 ? ((totalReceivedToday - totalPrev) / totalPrev) * 100 : 0;

      // Pending settlements: captured payments for today (approx)
      const CustomerPayment = require('../models/CustomerPayment');
      const capturedPayments = await CustomerPayment.find({
        entityId,
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'captured',
      }).lean();
      const pendingSettlementsAmount = capturedPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const pendingSettlementsGateways = new Set(capturedPayments.map(p => p.gatewayRef || p.paymentMethodDisplay)).size;

      // Vendor payouts: sum of vendor invoices not marked paid
      const VendorInvoice = require('../models/VendorInvoice');
      // Vendor invoices are global; do not restrict by entityId to ensure payouts are aggregated
      const vendorInvoices = await VendorInvoice.find({}).lean();
      const vendorPayoutsAmount = vendorInvoices.reduce((s, inv) => {
        if (!inv.status || inv.status === 'paid') return s;
        return s + (inv.amount || 0);
      }, 0);
      const vendorPayoutsStatusText = vendorPayoutsAmount > 0 ? 'Pending payouts' : 'No payouts scheduled';

      // Failed payments rate
      const totalCount = todaysTxns.length;
      const failedCount = todaysTxns.filter(t => t.status === 'failed').length;
      const failedPaymentsRatePercent = totalCount > 0 ? (failedCount / totalCount) * 100 : 0;

      return {
        entityId,
        date: startDate.toISOString(),
        totalReceivedToday,
        totalReceivedChangePercent,
        pendingSettlementsAmount,
        pendingSettlementsGateways,
        vendorPayoutsAmount,
        vendorPayoutsStatusText,
        failedPaymentsRatePercent,
        failedPaymentsCount: failedCount,
        failedPaymentsThresholdPercent: 1.0,
      };
    } catch (error) {
      logger.error('Error fetching finance summary:', error);
      throw error;
    }
  }

  async getPaymentMethodSplit(entityId, date) {
    try {
      const startDate = new Date(date);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setUTCHours(23, 59, 59, 999);

      const transactions = await LiveTransaction.find({
        entityId,
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'success',
      }).lean();

      const methodMap = {};
      let totalAmount = 0;
      let totalCount = 0;

      transactions.forEach(txn => {
        const method = txn.methodDisplay || 'unknown';
        if (!methodMap[method]) {
          methodMap[method] = { method, amount: 0, count: 0 };
        }
        methodMap[method].amount += txn.amount;
        methodMap[method].count += 1;
        totalAmount += txn.amount;
        totalCount += 1;
      });

      const result = Object.values(methodMap).map(item => ({
        method: item.method,
        label: item.method,
        percentage: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
        amount: item.amount,
        txnCount: item.count,
      }));

      return result;
    } catch (error) {
      logger.error('Error fetching payment method split:', error);
      throw error;
    }
  }

  async getLiveTransactions(entityId, limit = 10, cursor, method) {
    try {
      const query = { entityId };
      if (method) {
        query.methodDisplay = method;
      }
      if (cursor) {
        query._id = { $lt: cursor };
      }

      const transactions = await LiveTransaction.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return transactions.map(txn => ({
        id: txn._id.toString(),
        txnId: txn.txnId,
        amount: txn.amount,
        currency: txn.currency,
        methodDisplay: txn.methodDisplay,
        maskedDetails: txn.maskedDetails,
        status: txn.status,
        createdAt: txn.createdAt,
        gateway: txn.gateway,
        orderId: txn.orderId,
        customerName: txn.customerName,
      }));
    } catch (error) {
      logger.error('Error fetching live transactions:', error);
      throw error;
    }
  }

  async getDailyMetrics(entityId, days = 5) {
    try {
      const endDate = new Date();
      endDate.setUTCHours(23, 59, 59, 999);
      const startDate = new Date(endDate);
      startDate.setUTCDate(startDate.getUTCDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);

      const transactions = await LiveTransaction.find({
        entityId,
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const dailyMap = {};
      transactions.forEach(txn => {
        const dateKey = txn.createdAt.toISOString().split('T')[0];
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { revenue: 0, refunds: 0, transactions: 0 };
        }
        if (txn.status === 'success') {
          dailyMap[dateKey].revenue += txn.amount;
          dailyMap[dateKey].transactions += 1;
        } else if (txn.status === 'failed') {
          dailyMap[dateKey].refunds += txn.amount;
        }
      });

      const result = Object.entries(dailyMap).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        refunds: data.refunds,
        netRevenue: data.revenue - data.refunds,
        transactions: data.transactions,
        avgTicket: data.transactions > 0 ? data.revenue / data.transactions : 0,
      })).sort((a, b) => new Date(b.date) - new Date(a.date));

      return result;
    } catch (error) {
      logger.error('Error fetching daily metrics:', error);
      throw error;
    }
  }

  async getGatewayStatus(entityId) {
    try {
      const gateways = await LiveTransaction.distinct('gateway', { entityId });
      
      const result = await Promise.all(gateways.map(async (gateway) => {
        const transactions = await LiveTransaction.find({ 
          entityId, 
          gateway 
        }).sort({ createdAt: -1 }).limit(100).lean();

        const successCount = transactions.filter(t => t.status === 'success').length;
        const totalCount = transactions.length;
        const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 100;

        const lastTransaction = transactions[0];
        const lastCheck = lastTransaction ? lastTransaction.createdAt : new Date();

        return {
          id: gateway,
          name: gateway,
          status: successRate >= 95 ? 'online' : successRate >= 80 ? 'degraded' : 'offline',
          uptime: successRate,
          lastCheck: lastCheck.toISOString(),
          responseTime: Math.floor(Math.random() * 200) + 100, // Mock response time
        };
      }));

      return result;
    } catch (error) {
      logger.error('Error fetching gateway status:', error);
      throw error;
    }
  }

  async getHourlyTrends(entityId, date) {
    try {
      const targetDate = date ? new Date(date) : new Date();
      const startDate = new Date(targetDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setUTCHours(23, 59, 59, 999);

      const transactions = await LiveTransaction.find({
        entityId,
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'success',
      }).lean();

      const hourlyMap = {};
      for (let i = 0; i < 24; i++) {
        hourlyMap[i] = { amount: 0, transactions: 0 };
      }

      transactions.forEach(txn => {
        const hour = txn.createdAt.getHours();
        hourlyMap[hour].amount += txn.amount;
        hourlyMap[hour].transactions += 1;
      });

      const result = Object.entries(hourlyMap).map(([hour, data]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        amount: data.amount,
        transactions: data.transactions,
      }));

      return result;
    } catch (error) {
      logger.error('Error fetching hourly trends:', error);
      throw error;
    }
  }

  async exportFinanceReport(payload) {
    try {
      // In a real implementation, this would generate and upload a report
      // For now, return a mock URL
      const reportUrl = `https://reports.example.com/finance/${Date.now()}.pdf`;
      return { url: reportUrl };
    } catch (error) {
      logger.error('Error exporting finance report:', error);
      throw error;
    }
  }
}

module.exports = new FinanceDashboardService();

