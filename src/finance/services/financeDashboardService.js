const LiveTransaction = require('../models/LiveTransaction');
const logger = require('../../utils/logger');
const {
  normalizeEntityId,
  buildEntityFilter,
  buildDayRange,
  isReceivedTxn,
} = require('../utils/financeEntityScope');
const {
  resolveBucketFromLiveTxn,
  resolveBucketFromCustomerPayment,
  bucketLabel,
} = require('../utils/paymentMethodBuckets');

function roundPct(value) {
  return Math.round(value * 10) / 10;
}

function isCodTransaction(txn) {
  const method = String(txn.methodDisplay || '').toLowerCase();
  const gateway = String(txn.gateway || '').toLowerCase();
  return (
    method.includes('cod') ||
    method.includes('cash') ||
    gateway === 'cod' ||
    gateway.includes('cod')
  );
}

function isOnlineGatewayTransaction(txn) {
  return !isCodTransaction(txn);
}

class FinanceDashboardService {
  async getFinanceSummary(entityId, date) {
    try {
      const scopedEntityId = normalizeEntityId(entityId);
      const entityQuery = buildEntityFilter(scopedEntityId);
      const { startDate, endDate } = buildDayRange(date);
      const createdAtFilter = { $gte: startDate, $lte: endDate };

      const todaysTxns = await LiveTransaction.find({
        ...entityQuery,
        createdAt: createdAtFilter,
      }).lean();

      const totalReceivedToday = todaysTxns
        .filter(isReceivedTxn)
        .reduce((s, t) => s + (t.amount || 0), 0);

      const prevStart = new Date(startDate);
      prevStart.setDate(prevStart.getDate() - 1);
      const prevEnd = new Date(endDate);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevTxns = await LiveTransaction.find({
        ...entityQuery,
        createdAt: { $gte: prevStart, $lte: prevEnd },
      }).lean();
      const totalPrev = prevTxns.filter(isReceivedTxn).reduce((s, t) => s + (t.amount || 0), 0);

      const totalReceivedChangePercent = totalPrev > 0 ? ((totalReceivedToday - totalPrev) / totalPrev) * 100 : 0;

      const CustomerPayment = require('../models/CustomerPayment');
      const inFlightPayments = await CustomerPayment.find({
        ...entityQuery,
        createdAt: createdAtFilter,
        status: { $in: ['pending', 'authorized', 'captured'] },
      }).lean();
      const pendingSettlementsAmount = inFlightPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const pendingSettlementsGateways = new Set(
        inFlightPayments.map((p) => p.gatewayRef || p.paymentMethodDisplay).filter(Boolean)
      ).size;

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

      const successTxns = todaysTxns.filter(isReceivedTxn);

      const RefundRequest = require('../models/RefundRequest');
      const refundsToday = await RefundRequest.find({
        requestedAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['completed', 'processed', 'approved'] },
      }).lean();
      const refundsTodayAmount = refundsToday.reduce((s, r) => s + (r.amount || 0), 0);
      const netRevenueToday = Math.max(0, totalReceivedToday - refundsTodayAmount);

      const orderIds = new Set();
      successTxns.forEach(t => orderIds.add(t.orderId || t.txnId));
      const successfulOrderCount = orderIds.size || successTxns.length;
      const averageOrderValue =
        successfulOrderCount > 0 ? totalReceivedToday / successfulOrderCount : 0;

      const refundRatePercent =
        totalReceivedToday > 0
          ? roundPct((refundsTodayAmount / totalReceivedToday) * 100)
          : 0;

      const codSuccessTxns = successTxns.filter(isCodTransaction);
      const codSuccessAmount = codSuccessTxns.reduce((s, t) => s + (t.amount || 0), 0);
      const codPercent =
        totalReceivedToday > 0
          ? roundPct((codSuccessAmount / totalReceivedToday) * 100)
          : 0;

      const gatewayTxns = todaysTxns.filter(isOnlineGatewayTransaction);
      const gatewaySuccessCount = gatewayTxns.filter(isReceivedTxn).length;
      const gatewayFailedCount = gatewayTxns.filter((t) => t.status === 'failed').length;
      const gatewayTerminalCount = gatewaySuccessCount + gatewayFailedCount;
      const gatewaySuccessRatePercent =
        gatewayTerminalCount > 0
          ? roundPct((gatewaySuccessCount / gatewayTerminalCount) * 100)
          : 100;

      const paymentsToday = await CustomerPayment.find({
        ...entityQuery,
        createdAt: createdAtFilter,
        status: { $in: ['captured', 'authorized', 'declined', 'pending'] },
      }).lean();
      const settledPayments = paymentsToday.filter(p =>
        ['captured', 'authorized'].includes(p.status)
      );
      const settlementSuccessRatePercent =
        paymentsToday.length > 0
          ? roundPct((settledPayments.length / paymentsToday.length) * 100)
          : 100;

      return {
        entityId: scopedEntityId,
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
        netRevenueToday,
        refundsTodayAmount,
        refundsTodayCount: refundsToday.length,
        settlementSuccessRatePercent,
        settledPaymentsCount: settledPayments.length,
        settlementAttemptsCount: paymentsToday.length,
        averageOrderValue,
        successfulOrderCount,
        refundRatePercent,
        codPercent,
        codTxnCount: codSuccessTxns.length,
        gatewaySuccessRatePercent,
        gatewaySuccessCount,
        gatewayTerminalCount,
      };
    } catch (error) {
      logger.error('Error fetching finance summary:', error);
      throw error;
    }
  }

  async getPaymentMethodSplit(entityId, date) {
    try {
      const { startDate, endDate } = buildDayRange(date);
      const entityQuery = buildEntityFilter(normalizeEntityId(entityId));
      const createdAtFilter = { $gte: startDate, $lte: endDate };

      const transactions = await LiveTransaction.find({
        ...entityQuery,
        createdAt: createdAtFilter,
        status: { $in: ['success', 'pending'] },
      }).lean();

      const methodMap = {};

      const addToBucket = (bucketKey, amount) => {
        const amt = Number(amount) || 0;
        if (!methodMap[bucketKey]) {
          methodMap[bucketKey] = { method: bucketKey, label: bucketLabel(bucketKey), amount: 0, count: 0 };
        }
        methodMap[bucketKey].amount += amt;
        methodMap[bucketKey].count += 1;
      };

      transactions.forEach((txn) => {
        addToBucket(resolveBucketFromLiveTxn(txn), txn.amount || 0);
      });

      if (transactions.length === 0) {
        const CustomerPayment = require('../models/CustomerPayment');
        const payments = await CustomerPayment.find({
          ...entityQuery,
          createdAt: createdAtFilter,
          status: { $in: ['pending', 'captured', 'authorized'] },
        }).lean();
        payments.forEach((p) => {
          addToBucket(resolveBucketFromCustomerPayment(p), p.amount || 0);
        });
      }

      const totalAmount = Object.values(methodMap).reduce((s, row) => s + row.amount, 0);
      const order = ['cards', 'digital_wallets', 'cod', 'other'];

      const result = order
        .filter((key) => methodMap[key])
        .map((key) => {
          const item = methodMap[key];
          return {
            method: item.method,
            label: item.label,
            percentage: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
            amount: item.amount,
            txnCount: item.count,
          };
        });

      return result;
    } catch (error) {
      logger.error('Error fetching payment method split:', error);
      throw error;
    }
  }

  async getLiveTransactions(entityId, limit = 10, cursor, method) {
    try {
      const query = { ...buildEntityFilter(normalizeEntityId(entityId)) };
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
        ...buildEntityFilter(normalizeEntityId(entityId)),
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const dailyMap = {};
      transactions.forEach(txn => {
        const dateKey = txn.createdAt.toISOString().split('T')[0];
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { revenue: 0, refunds: 0, transactions: 0 };
        }
        if (isReceivedTxn(txn)) {
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
      const entityQuery = buildEntityFilter(normalizeEntityId(entityId));
      const gateways = await LiveTransaction.distinct('gateway', entityQuery);

      const result = await Promise.all(gateways.map(async (gateway) => {
        const transactions = await LiveTransaction.find({
          ...entityQuery,
          gateway,
        })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean();

        const successCount = transactions.filter(isReceivedTxn).length;
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
        ...buildEntityFilter(normalizeEntityId(entityId)),
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['success', 'pending'] },
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

  /**
   * Aggregate customer + picker wallet balances (platform liability).
   */
  async getWalletLiability() {
    try {
      const { CustomerWallet } = require('../../customer-backend/models/CustomerWallet');
      const PickerWallet = require('../../picker/models/wallet.model');

      const [customerAgg, pickerAgg] = await Promise.all([
        CustomerWallet.aggregate([
          { $group: { _id: null, total: { $sum: { $ifNull: ['$balance', 0] } } } },
        ]),
        PickerWallet.aggregate([
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $add: [
                    { $ifNull: ['$availableBalance', 0] },
                    { $ifNull: ['$pendingBalance', 0] },
                  ],
                },
              },
            },
          },
        ]),
      ]);

      const customerWalletBalance = customerAgg[0]?.total ?? 0;
      const pickerWalletBalance = pickerAgg[0]?.total ?? 0;

      return {
        totalBalance: customerWalletBalance + pickerWalletBalance,
        customerWalletBalance,
        pickerWalletBalance,
      };
    } catch (error) {
      logger.error('Error fetching wallet liability:', error);
      throw error;
    }
  }

  async exportFinanceReport(payload) {
    try {
      const entityId = payload?.entityId || 'default';
      const from = new Date(payload.dateRange.from);
      const to = new Date(payload.dateRange.to);
      const format = payload.format || 'csv';
      const scopes = Array.isArray(payload.scope) && payload.scope.length ? payload.scope : ['overview'];

      const escapeCsv = (val) => {
        const s = String(val ?? '');
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };

      const rows = [];
      const pushRow = (...cells) => rows.push(cells);
      const pushSection = (title) => {
        pushRow();
        pushRow(title);
      };

      pushRow('Finance Report');
      pushRow('Entity', entityId);
      pushRow('Period From', from.toISOString());
      pushRow('Period To', to.toISOString());
      pushRow('Generated At', new Date().toISOString());
      pushRow('Scopes', scopes.join('; '));

      const CustomerPayment = require('../models/CustomerPayment');
      const dateFilter = { $gte: from, $lte: to };

      if (scopes.includes('overview')) {
        pushSection('Payments Overview');
        const txns = await LiveTransaction.find({
          entityId,
          createdAt: dateFilter,
        })
          .sort({ createdAt: -1 })
          .limit(2000)
          .lean();

        const successTxns = txns.filter((t) => t.status === 'success');
        const failedTxns = txns.filter((t) => t.status === 'failed');
        const grossVolume = successTxns.reduce((s, t) => s + (t.amount || 0), 0);

        pushRow('Metric', 'Value');
        pushRow('Total Transactions', txns.length);
        pushRow('Successful Transactions', successTxns.length);
        pushRow('Failed Transactions', failedTxns.length);
        pushRow('Gross Volume (INR)', grossVolume.toFixed(2));
        pushRow(
          'Failure Rate %',
          txns.length > 0 ? ((failedTxns.length / txns.length) * 100).toFixed(2) : '0'
        );

        pushSection('Payment Method Split');
        pushRow('Method', 'Amount (INR)', 'Transaction Count');
        const methodMap = {};
        successTxns.forEach((txn) => {
          const method = txn.methodDisplay || 'unknown';
          if (!methodMap[method]) methodMap[method] = { amount: 0, count: 0 };
          methodMap[method].amount += txn.amount || 0;
          methodMap[method].count += 1;
        });
        Object.entries(methodMap).forEach(([method, data]) => {
          pushRow(method, data.amount.toFixed(2), data.count);
        });

        pushSection('Live Transactions (sample)');
        pushRow('Txn ID', 'Order ID', 'Customer', 'Amount', 'Method', 'Status', 'Gateway', 'Created At');
        txns.slice(0, 500).forEach((t) => {
          pushRow(
            t.txnId,
            t.orderId || '',
            t.customerName || '',
            (t.amount || 0).toFixed(2),
            t.methodDisplay || '',
            t.status || '',
            t.gateway || '',
            t.createdAt ? new Date(t.createdAt).toISOString() : ''
          );
        });
      }

      if (scopes.includes('gateway')) {
        pushSection('Gateway Performance');
        const gateways = await LiveTransaction.distinct('gateway', { entityId });
        pushRow('Gateway', 'Success Rate %', 'Status', 'Transactions In Period');
        for (const gateway of gateways) {
          const gatewayTxns = await LiveTransaction.find({
            entityId,
            gateway,
            createdAt: dateFilter,
          }).lean();
          const successCount = gatewayTxns.filter((t) => t.status === 'success').length;
          const terminal = gatewayTxns.filter((t) => t.status === 'success' || t.status === 'failed').length;
          const successRate = terminal > 0 ? (successCount / terminal) * 100 : 100;
          const status = successRate >= 95 ? 'online' : successRate >= 80 ? 'degraded' : 'offline';
          pushRow(gateway, successRate.toFixed(2), status, gatewayTxns.length);
        }
      }

      if (scopes.includes('failed')) {
        pushSection('Failed Payments Analysis');
        const failedPayments = await CustomerPayment.find({
          entityId,
          createdAt: dateFilter,
          status: { $in: ['declined', 'pending', 'chargeback'] },
        })
          .sort({ createdAt: -1 })
          .limit(500)
          .lean();

        pushRow('Order ID', 'Customer', 'Amount', 'Method', 'Status', 'Gateway Ref', 'Failure Reason');
        failedPayments.forEach((p) => {
          pushRow(
            p.orderId,
            p.customerName,
            (p.amount || 0).toFixed(2),
            p.paymentMethodDisplay || p.methodType,
            p.status,
            p.gatewayRef || '',
            p.failureReason || ''
          );
        });

        const failedLive = await LiveTransaction.find({
          entityId,
          createdAt: dateFilter,
          status: 'failed',
        })
          .sort({ createdAt: -1 })
          .limit(500)
          .lean();

        pushSection('Failed Live Transactions');
        pushRow('Txn ID', 'Order ID', 'Customer', 'Amount', 'Method', 'Gateway', 'Created At');
        failedLive.forEach((t) => {
          pushRow(
            t.txnId,
            t.orderId || '',
            t.customerName || '',
            (t.amount || 0).toFixed(2),
            t.methodDisplay || '',
            t.gateway || '',
            t.createdAt ? new Date(t.createdAt).toISOString() : ''
          );
        });
      }

      const csvBody = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
      const dateSlug = from.toISOString().split('T')[0];

      if (format === 'pdf') {
        const escapeHtml = (val) =>
          String(val ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const tableRows = rows
          .map((r) => {
            if (r.length === 1) {
              return `<tr><th colspan="8" style="text-align:left;background:#f4f4f5">${escapeHtml(r[0])}</th></tr>`;
            }
            return `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
          })
          .join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Finance Report</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e4e4e7;padding:6px 8px;font-size:12px}th{background:#f4f4f5}</style></head>
<body><h1>Finance Report</h1><table>${tableRows}</table></body></html>`;
        return {
          fileContent: html,
          contentType: 'text/html; charset=utf-8',
          filename: `finance-report-${dateSlug}.html`,
        };
      }

      const ext = format === 'xlsx' ? 'csv' : 'csv';
      return {
        fileContent: csvBody,
        contentType: 'text/csv; charset=utf-8',
        filename: `finance-report-${dateSlug}.${ext}`,
      };
    } catch (error) {
      logger.error('Error exporting finance report:', error);
      throw error;
    }
  }
}

module.exports = new FinanceDashboardService();

