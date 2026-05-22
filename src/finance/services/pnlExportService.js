const LiveTransaction = require('../models/LiveTransaction');
const CustomerPayment = require('../models/CustomerPayment');
const VendorInvoice = require('../models/VendorInvoice');
const RefundRequest = require('../models/RefundRequest');
const LedgerEntry = require('../models/LedgerEntry');
const { buildEntityFilter, isReceivedTxn } = require('../utils/financeEntityScope');
const logger = require('../../utils/logger');

function parseRange(from, to) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid report date range');
  }
  return { start, end };
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function aggregatePnL(from, to, entityId = 'default') {
  const { start, end } = parseRange(from, to);
  const entityQuery = buildEntityFilter(entityId);
  const dateFilter = { $gte: start, $lte: end };

  const [liveTxns, payments, vendorInvoices, refunds, ledgerRows] = await Promise.all([
    LiveTransaction.find({ ...entityQuery, createdAt: dateFilter }).lean(),
    CustomerPayment.find({ ...entityQuery, createdAt: dateFilter }).lean(),
    VendorInvoice.find({
      status: { $in: ['approved', 'scheduled', 'paid'] },
      invoiceDate: dateFilter,
    }).lean(),
    RefundRequest.find({
      status: { $in: ['processed', 'completed'] },
      $or: [
        { processedAt: dateFilter },
        { completedAt: dateFilter },
        { updatedAt: dateFilter },
      ],
    }).lean(),
    LedgerEntry.find({ date: dateFilter }).lean(),
  ]);

  const revenueFromLive = liveTxns
    .filter(isReceivedTxn)
    .reduce((s, t) => s + (t.amount || 0), 0);

  const paymentRevenue = payments
    .filter((p) => ['captured', 'authorized'].includes(p.status))
    .reduce((s, p) => s + (p.amount || 0), 0);

  const grossRevenue = revenueFromLive > 0 ? revenueFromLive : paymentRevenue;

  const refundTotal = refunds.reduce((s, r) => s + (r.amount || 0), 0);
  const cogs = vendorInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);

  const ledgerVendorExp = ledgerRows
    .filter((e) => e.accountCode?.startsWith('5100'))
    .reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);
  const ledgerRefundExp = ledgerRows
    .filter((e) => e.accountCode?.startsWith('5200'))
    .reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);

  const totalCogs = cogs > 0 ? cogs : ledgerVendorExp;
  const totalRefunds = refundTotal > 0 ? refundTotal : ledgerRefundExp;

  const netRevenue = grossRevenue - totalRefunds;
  const grossProfit = netRevenue - totalCogs;

  const monthly = {};
  const ensureMonth = (key) => {
    if (!monthly[key]) {
      monthly[key] = { revenue: 0, refunds: 0, cogs: 0 };
    }
    return monthly[key];
  };

  liveTxns.filter(isReceivedTxn).forEach((t) => {
    const m = ensureMonth(monthKey(t.createdAt));
    m.revenue += t.amount || 0;
  });

  refunds.forEach((r) => {
    const d = r.processedAt || r.completedAt || r.updatedAt || r.requestedAt;
    const m = ensureMonth(monthKey(d));
    m.refunds += r.amount || 0;
  });

  vendorInvoices.forEach((inv) => {
    const m = ensureMonth(monthKey(inv.invoiceDate || inv.createdAt));
    m.cogs += inv.amount || 0;
  });

  const monthlyRows = Object.keys(monthly)
    .sort()
    .map((key) => {
      const m = monthly[key];
      const net = m.revenue - m.refunds;
      return {
        period: monthLabel(key),
        revenue: round2(m.revenue),
        refunds: round2(m.refunds),
        netRevenue: round2(net),
        cogs: round2(m.cogs),
        grossProfit: round2(net - m.cogs),
      };
    });

  const gatewayMap = {};
  liveTxns.filter(isReceivedTxn).forEach((t) => {
    const g = t.gateway || 'other';
    gatewayMap[g] = (gatewayMap[g] || 0) + (t.amount || 0);
  });

  const vendorMap = {};
  vendorInvoices.forEach((inv) => {
    const name = inv.vendorName || 'Unknown';
    vendorMap[name] = (vendorMap[name] || 0) + (inv.amount || 0);
  });

  return {
    from,
    to,
    entityId,
    grossRevenue: round2(grossRevenue),
    refunds: round2(totalRefunds),
    netRevenue: round2(netRevenue),
    cogs: round2(totalCogs),
    grossProfit: round2(grossProfit),
    netIncome: round2(grossProfit),
    monthlyRows,
    gatewayBreakdown: Object.entries(gatewayMap).map(([name, amount]) => ({
      name,
      amount: round2(amount),
    })),
    vendorBreakdown: Object.entries(vendorMap).map(([name, amount]) => ({
      name,
      amount: round2(amount),
    })),
    refundCount: refunds.length,
    transactionCount: liveTxns.filter(isReceivedTxn).length,
  };
}

function escapeCsv(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildPnLRows(pnl, details = 'summary') {
  const rows = [];
  const push = (...cells) => rows.push(cells);

  push('Profit & Loss Statement');
  push('Entity', pnl.entityId);
  push('Period From', pnl.from);
  push('Period To', pnl.to);
  push('Generated At', new Date().toISOString());
  push('Currency', 'INR');
  push();

  push('SUMMARY');
  push('Line Item', 'Amount (INR)');
  push('Gross Revenue', pnl.grossRevenue.toFixed(2));
  push('Less: Customer Refunds', `(${pnl.refunds.toFixed(2)})`);
  push('Net Revenue', pnl.netRevenue.toFixed(2));
  push('Cost of Goods Sold (Vendor)', `(${pnl.cogs.toFixed(2)})`);
  push('Gross Profit', pnl.grossProfit.toFixed(2));
  push('Net Income', pnl.netIncome.toFixed(2));
  push();
  push('Volume');
  push('Successful Transactions', String(pnl.transactionCount));
  push('Refund Requests Processed', String(pnl.refundCount));

  if (details === 'detailed') {
    push();
    push('MONTHLY BREAKDOWN');
    push('Period', 'Revenue', 'Refunds', 'Net Revenue', 'COGS', 'Gross Profit');
    pnl.monthlyRows.forEach((m) => {
      push(
        m.period,
        m.revenue.toFixed(2),
        m.refunds.toFixed(2),
        m.netRevenue.toFixed(2),
        m.cogs.toFixed(2),
        m.grossProfit.toFixed(2)
      );
    });

    if (pnl.gatewayBreakdown.length) {
      push();
      push('REVENUE BY GATEWAY');
      push('Gateway', 'Amount (INR)');
      pnl.gatewayBreakdown
        .sort((a, b) => b.amount - a.amount)
        .forEach((g) => push(g.name, g.amount.toFixed(2)));
    }

    if (pnl.vendorBreakdown.length) {
      push();
      push('COGS BY VENDOR');
      push('Vendor', 'Amount (INR)');
      pnl.vendorBreakdown
        .sort((a, b) => b.amount - a.amount)
        .forEach((v) => push(v.name, v.amount.toFixed(2)));
    }
  }

  return rows;
}

function rowsToCsv(rows) {
  return `\uFEFF${rows.map((r) => r.map(escapeCsv).join(',')).join('\n')}`;
}

function rowsToHtml(rows, title, meta = {}) {
  const escapeHtml = (val) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const tableRows = rows
    .map((r, idx) => {
      if (r.length === 1) {
        return `<tr><th colspan="6" style="text-align:left;background:#f0fdfa;color:#0f766e">${escapeHtml(r[0])}</th></tr>`;
      }
      if (r.length === 2) {
        return `<tr><td style="font-weight:600">${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`;
      }
      if (idx > 0 && rows[idx - 1]?.length > 2 && r.length > 2) {
        return `<tr>${r.map((c, i) =>
          i === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`
        ).join('')}</tr>`;
      }
      return `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
    })
    .join('');

  const periodMeta =
    meta.from && meta.to
      ? `${escapeHtml(meta.from)} to ${escapeHtml(meta.to)}`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#111}
h1{font-size:22px;margin-bottom:8px}
.meta{color:#666;font-size:13px;margin-bottom:24px}
table{border-collapse:collapse;width:100%;margin-bottom:24px}
td,th{border:1px solid #e5e7eb;padding:8px 10px;font-size:13px;text-align:left}
th{background:#f9fafb;font-weight:600}
tr:nth-child(even){background:#fafafa}
@media print{body{padding:16px}}
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Selorg Finance · ${periodMeta} · Generated ${new Date().toLocaleString('en-IN')}</p>
<table>${tableRows}</table>
<p style="font-size:11px;color:#9ca3af">Open in browser and use Print → Save as PDF for a PDF copy.</p>
</body></html>`;
}

async function exportPnLReport(request) {
  const entityId = request.entityId || 'default';
  const details = request.details || 'summary';
  const format = request.format || 'pdf';
  const pnl = await aggregatePnL(request.from, request.to, entityId);
  const rows = buildPnLRows(pnl, details);
  const dateSlug = `${request.from}_${request.to}`;

  if (format === 'pdf') {
    const html = rowsToHtml(rows, 'Profit & Loss Statement', {
      from: pnl.from,
      to: pnl.to,
    });
    return {
      fileContent: html,
      contentType: 'text/html; charset=utf-8',
      filename: `P&L_Report_${dateSlug}.html`,
    };
  }

  const csv = rowsToCsv(rows);
  const ext = format === 'xlsx' ? 'csv' : 'csv';
  return {
    fileContent: csv,
    contentType: 'text/csv; charset=utf-8',
    filename: `P&L_Report_${dateSlug}.${ext}`,
  };
}

module.exports = {
  aggregatePnL,
  exportPnLReport,
};
