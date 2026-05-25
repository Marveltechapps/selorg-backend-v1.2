const InventoryAdjustment = require('../models/InventoryAdjustment');
const InventoryItem = require('../models/InventoryItem');
const Staff = require('../models/Staff');
const Absence = require('../models/Absence');
const StaffPerformance = require('../models/StaffPerformance');
const ComplianceLog = require('../models/ComplianceLog');
const PickerIssue = require('../../picker/models/issue.model');
const cycleCountReportService = require('./cycleCountReport.service');
const { parseReportDateRange, staffPeriodFromRange } = require('../utils/reportDateRange');

const ESTIMATED_UNIT_VALUE_INR = Number(process.env.REPORT_UNIT_VALUE_INR) || 25;

function formatInr(amount) {
  return `₹${amount.toFixed(2)}`;
}

function mapAdjustmentType(adj) {
  const reason = String(adj.reason || adj.reason_code || '').toLowerCase();
  if (adj.action === 'damage') {
    return reason.includes('spill') ? 'Spillage' : 'Damage';
  }
  if (adj.action === 'remove' || reason.includes('shrink') || reason.includes('missing')) {
    return 'Shrink';
  }
  return 'Damage';
}

function estimateLineValue(quantity) {
  return Math.abs(Number(quantity) || 0) * ESTIMATED_UNIT_VALUE_INR;
}

async function getInventoryReport(storeId, range) {
  const { start, end, previousStart, previousEnd, label } = parseReportDateRange(range);

  const dateQuery = { $gte: start, $lte: end };
  const prevDateQuery = { $gte: previousStart, $lte: previousEnd };

  const [adjustments, previousAdjustments, itemNames] = await Promise.all([
    InventoryAdjustment.find({ store_id: storeId, createdAt: dateQuery })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    InventoryAdjustment.find({
      store_id: storeId,
      createdAt: prevDateQuery,
      $or: [{ action: 'damage' }, { action: 'remove' }],
    }).lean(),
    InventoryItem.find({ store_id: storeId }).select('sku name').lean(),
  ]);

  const nameBySku = new Map(itemNames.map((i) => [i.sku, i.name]));

  let shrinkageValue = 0;
  let damageCount = 0;
  const damageByProduct = new Map();

  for (const adj of adjustments) {
    const val = estimateLineValue(adj.quantity);
    const type = mapAdjustmentType(adj);
    if (type === 'Shrink') shrinkageValue += val;
    if (adj.action === 'damage' || type === 'Damage' || type === 'Spillage') {
      damageCount += Math.abs(Number(adj.quantity) || 0);
      const name = nameBySku.get(adj.sku) || adj.sku;
      damageByProduct.set(name, (damageByProduct.get(name) || 0) + Math.abs(Number(adj.quantity) || 0));
    }
  }

  let prevShrinkage = 0;
  for (const adj of previousAdjustments) {
    if (mapAdjustmentType(adj) === 'Shrink') prevShrinkage += estimateLineValue(adj.quantity);
  }
  const shrinkageDeltaPct =
    prevShrinkage > 0 ? ((shrinkageValue - prevShrinkage) / prevShrinkage) * 100 : shrinkageValue > 0 ? 100 : 0;

  let mostDamaged = '—';
  if (damageByProduct.size > 0) {
    mostDamaged = [...damageByProduct.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const cycleData = await cycleCountReportService.loadCycleCountData(storeId);
  const accuracyPct = cycleData?.metrics?.accuracy_rate?.percentage ?? 0;
  const accuracyTarget = cycleData?.metrics?.accuracy_rate?.target ?? 99;
  const auditPassed = accuracyPct >= accuracyTarget;

  const discrepancies = adjustments
    .filter((a) => ['damage', 'remove'].includes(a.action))
    .slice(0, 50)
    .map((adj) => {
      const type = mapAdjustmentType(adj);
      const qty = Math.abs(Number(adj.quantity) || 0);
      return {
        sku: adj.sku,
        product_name: nameBySku.get(adj.sku) || 'Unknown Product',
        type,
        quantity: qty,
        value: formatInr(estimateLineValue(adj.quantity)),
        reason: adj.reason || adj.reason_code || adj.notes || '—',
        created_at: adj.createdAt,
      };
    });

  return {
    period: label,
    range,
    kpis: {
      shrinkage_value: shrinkageValue,
      shrinkage_value_display: formatInr(shrinkageValue),
      shrinkage_delta_pct: Math.round(shrinkageDeltaPct * 10) / 10,
      damage_writeoff_count: damageCount,
      most_damaged_product: mostDamaged,
      cycle_count_accuracy_pct: Math.round(accuracyPct * 10) / 10,
      cycle_count_target_pct: accuracyTarget,
      audit_passed: auditPassed,
    },
    discrepancies,
  };
}

async function getStaffReport(storeId, range) {
  const { start, end, label } = parseReportDateRange(range);
  const period = staffPeriodFromRange(range);

  const [totalStaff, activeStaff, absencesInRange, performance, issues] = await Promise.all([
    Staff.countDocuments({ store_id: storeId }),
    Staff.countDocuments({ store_id: storeId, status: 'Active' }),
    Absence.countDocuments({ store_id: storeId, date: { $gte: start, $lte: end } }),
    StaffPerformance.find({ store_id: storeId, period }).lean(),
    PickerIssue.find({ storeId, reportedAt: { $gte: start, $lte: end } }).lean(),
  ]);

  const presentCount = Math.max(0, activeStaff - Math.min(absencesInRange, activeStaff));
  const attendanceRate =
    activeStaff > 0 ? Math.round((presentCount / activeStaff) * 1000) / 10 : 0;

  let errorContribution = [];
  if (performance.length > 0) {
    const buckets = { 'Picking Errors': 0, 'Packing Errors': 0, Labeling: 0 };
    for (const p of performance) {
      const role = String(p.role || '').toLowerCase();
      const err = parseFloat(String(p.error_rate || '0').replace(/[^0-9.]/g, '')) || 0;
      if (role.includes('pack')) buckets['Packing Errors'] += err;
      else if (role.includes('label')) buckets.Labeling += err;
      else buckets['Picking Errors'] += err;
    }
    const total = Object.values(buckets).reduce((s, v) => s + v, 0) || 1;
    errorContribution = Object.entries(buckets).map(([type, val]) => ({
      type,
      percent: Math.round((val / total) * 100),
    }));
  } else if (issues.length > 0) {
    const buckets = { 'Picking Errors': 0, 'Packing Errors': 0, Labeling: 0 };
    for (const issue of issues) {
      if (issue.issueType === 'inventory_mismatch' || issue.issueType === 'shelf_empty') {
        buckets['Picking Errors'] += 1;
      } else if (issue.issueType === 'item_damaged') {
        buckets['Packing Errors'] += 1;
      } else {
        buckets.Labeling += 1;
      }
    }
    const total = issues.length;
    errorContribution = Object.entries(buckets).map(([type, count]) => ({
      type,
      percent: Math.round((count / total) * 100),
    }));
  } else {
    errorContribution = [
      { type: 'Picking Errors', percent: 0 },
      { type: 'Packing Errors', percent: 0 },
      { type: 'Labeling', percent: 0 },
    ];
  }

  return {
    period: label,
    range,
    attendance: {
      rate_pct: attendanceRate,
      present_count: presentCount,
      active_staff: activeStaff,
      absent_count: absencesInRange,
      total_staff: totalStaff,
    },
    error_contribution: errorContribution,
    performance_period: period,
  };
}

async function getComplianceReport(storeId, range, options = {}) {
  const { start, end, label } = parseReportDateRange(range);
  const category = options.category || 'all';
  const limit = Math.min(parseInt(options.limit, 10) || 100, 500);
  const page = parseInt(options.page, 10) || 1;
  const skip = (page - 1) * limit;

  const query = {
    store_id: storeId,
    logged_at: { $gte: start, $lte: end },
  };
  if (category !== 'all') query.category = category;

  const [logs, total] = await Promise.all([
    ComplianceLog.find(query).sort({ logged_at: -1 }).skip(skip).limit(limit).lean(),
    ComplianceLog.countDocuments(query),
  ]);

  return {
    period: label,
    range,
    logs: logs.map((l) => ({
      log_id: l.log_id,
      category: l.category,
      zone: l.zone,
      reading: l.reading,
      threshold: l.threshold,
      status: l.status,
      logged_by: l.logged_by,
      logged_at: l.logged_at,
    })),
    pagination: {
      current_page: page,
      total_pages: Math.ceil(total / limit) || 1,
      total_items: total,
      items_per_page: limit,
    },
  };
}

async function buildExportRows(storeId, range) {
  const [inventory, staff, compliance] = await Promise.all([
    getInventoryReport(storeId, range),
    getStaffReport(storeId, range),
    getComplianceReport(storeId, range, { limit: 1000 }),
  ]);

  const rows = [['Section', 'Field', 'Value']];
  rows.push(['Inventory', 'Period', inventory.period]);
  rows.push(['Inventory', 'Shrinkage', inventory.kpis.shrinkage_value_display]);
  rows.push(['Inventory', 'Damage items', String(inventory.kpis.damage_writeoff_count)]);
  rows.push(['Inventory', 'Cycle accuracy %', String(inventory.kpis.cycle_count_accuracy_pct)]);
  rows.push(['Staff', 'Attendance %', String(staff.attendance.rate_pct)]);
  rows.push(['Staff', 'Present', String(staff.attendance.present_count)]);
  rows.push(['Compliance', 'Log count', String(compliance.pagination.total_items)]);

  for (const d of inventory.discrepancies) {
    rows.push([
      'Discrepancy',
      d.sku,
      `${d.type}|${d.quantity}|${d.value}|${d.reason}`,
    ]);
  }
  for (const log of compliance.logs) {
    rows.push([
      'Compliance',
      log.log_id,
      `${log.category}|${log.zone}|${log.status}|${log.reading}`,
    ]);
  }
  return rows;
}

module.exports = {
  getInventoryReport,
  getStaffReport,
  getComplianceReport,
  buildExportRows,
};
