/**
 * Admin analytics: picker workforce performance (aggregates picker DB collections).
 */
const PickerUser = require('../../picker/models/user.model');
const PickerAttendance = require('../../picker/models/attendance.model');
const PickerIssue = require('../../picker/models/issue.model');
const WorkLocation = require('../../picker/models/workLocation.model');

function parseDateRange(from, to, period) {
  const end = to ? new Date(to) : new Date();
  let start;
  if (from) {
    start = new Date(from);
  } else if (period === 'month') {
    start = new Date(end);
    start.setMonth(start.getMonth() - 1);
  } else {
    start = new Date(end);
    start.setDate(start.getDate() - 7);
  }
  return { start, end };
}

async function getPickerAnalytics({ locationId, from, to, period }) {
  const { start, end } = parseDateRange(from, to, period);
  const locFilter = locationId && String(locationId).trim() ? { currentLocationId: String(locationId).trim() } : {};

  const activeStatuses = ['ACTIVE'];
  const [totalActivePickers, attendanceAgg, issueStats, byLocation, dailyAgg, topAgg] = await Promise.all([
    PickerUser.countDocuments({ status: { $in: activeStatuses }, ...locFilter }),
    PickerAttendance.aggregate([
      {
        $match: {
          punchIn: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: 'picker_users',
          localField: 'userId',
          foreignField: '_id',
          as: 'pu',
        },
      },
      { $unwind: { path: '$pu', preserveNullAndEmptyArrays: true } },
      ...(Object.keys(locFilter).length
        ? [{ $match: { 'pu.currentLocationId': locFilter.currentLocationId } }]
        : []),
      {
        $group: {
          _id: null,
          totalOrders: { $sum: { $ifNull: ['$ordersCompleted', 0] } },
          totalMinutes: { $sum: { $ifNull: ['$totalWorkedMinutes', 0] } },
          shifts: { $sum: 1 },
        },
      },
    ]),
    Promise.all([
      PickerIssue.countDocuments({ reportedAt: { $gte: start, $lte: end }, status: 'open' }),
      PickerIssue.countDocuments({ reportedAt: { $gte: start, $lte: end } }),
    ]),
    PickerUser.aggregate([
      { $match: { status: 'ACTIVE', ...locFilter } },
      {
        $group: {
          _id: '$currentLocationId',
          activePickers: { $sum: 1 },
        },
      },
    ]),
    PickerAttendance.aggregate([
      { $match: { punchIn: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$punchIn' } },
          totalPicks: { $sum: { $ifNull: ['$ordersCompleted', 0] } },
          shiftRows: { $sum: 1 },
          totalMinutes: { $sum: { $ifNull: ['$totalWorkedMinutes', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PickerAttendance.aggregate([
      { $match: { punchIn: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$userId',
          picks: { $sum: { $ifNull: ['$ordersCompleted', 0] } },
          minutes: { $sum: { $ifNull: ['$totalWorkedMinutes', 0] } },
          shifts: { $sum: 1 },
        },
      },
      { $sort: { picks: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const aggRow = attendanceAgg[0] || { totalOrders: 0, totalMinutes: 0, shifts: 0 };
  const hours = Math.max(aggRow.totalMinutes / 60, 0.01);
  const avgPicksPerHour = Math.round((aggRow.totalOrders / hours) * 10) / 10;

  const [openIssues, totalIssues] = issueStats;
  const avgAccuracy =
    totalIssues > 0
      ? Math.max(0, Math.min(100, Math.round((1 - openIssues / totalIssues) * 1000) / 10))
      : 97.5;

  const attendedPickers = await PickerAttendance.distinct('userId', {
    punchIn: { $gte: start, $lte: end },
  });
  const eligible = await PickerUser.countDocuments({ status: 'ACTIVE', ...locFilter });
  const avgAttendanceRate =
    eligible > 0 ? Math.round((attendedPickers.length / eligible) * 1000) / 10 : 0;

  const locIds = byLocation.map((r) => r._id).filter(Boolean);
  const locDocs = locIds.length
    ? await WorkLocation.find({ locationId: { $in: locIds.map(String) } }).select('locationId name').lean()
    : [];
  const locNames = Object.fromEntries(locDocs.map((l) => [l.locationId, l.name]));

  const locationBreakdown = await Promise.all(
    byLocation.map(async (row) => {
      const lid = row._id ? String(row._id) : '';
      const subAgg = await PickerAttendance.aggregate([
        {
          $match: {
            punchIn: { $gte: start, $lte: end },
          },
        },
        {
          $lookup: {
            from: 'picker_users',
            localField: 'userId',
            foreignField: '_id',
            as: 'pu',
          },
        },
        { $unwind: { path: '$pu', preserveNullAndEmptyArrays: true } },
        { $match: { 'pu.currentLocationId': lid } },
        {
          $group: {
            _id: null,
            orders: { $sum: { $ifNull: ['$ordersCompleted', 0] } },
            minutes: { $sum: { $ifNull: ['$totalWorkedMinutes', 0] } },
          },
        },
      ]);
      const s = subAgg[0] || { orders: 0, minutes: 0 };
      const h = Math.max(s.minutes / 60, 0.01);
      return {
        locationId: lid,
        locationName: locNames[lid] || lid || '—',
        activePickers: row.activePickers,
        avgPicksPerHour: Math.round((s.orders / h) * 10) / 10,
      };
    })
  );

  const topUserIds = topAgg.map((t) => t._id).filter(Boolean);
  const topUsers = topUserIds.length
    ? await PickerUser.find({ _id: { $in: topUserIds } })
        .select('name currentLocationId')
        .lean()
    : [];
  const topMap = Object.fromEntries(topUsers.map((u) => [u._id.toString(), u]));

  const topPerformers = topAgg.map((t) => {
    const uid = t._id.toString();
    const u = topMap[uid];
    const mins = Math.max(t.minutes || 0, 1);
    const pph = Math.round(((t.picks || 0) / (mins / 60)) * 10) / 10;
    return {
      pickerId: uid,
      name: u?.name || '—',
      picksPerHour: pph,
      accuracy: avgAccuracy,
      shiftsThisMonth: t.shifts || 0,
    };
  });

  const dailyTrend = dailyAgg.map((d) => {
    const mins = Math.max(d.totalMinutes || 0, 1);
    return {
      date: d._id,
      totalPicks: d.totalPicks || 0,
      activePickers: d.shiftRows || 0,
      avgAccuracy,
    };
  });

  return {
    summary: {
      totalActivePickers,
      avgPicksPerHour,
      avgAccuracy,
      totalShiftsCompleted: aggRow.shifts || 0,
      avgAttendanceRate,
    },
    topPerformers,
    locationBreakdown,
    dailyTrend,
  };
}

module.exports = { getPickerAnalytics };
