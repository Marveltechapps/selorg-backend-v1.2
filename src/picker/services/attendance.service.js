/**
 * Attendance service – from backend-workflow.yaml (attendance_summary).
 * Pay rates from picker config (dashboard-managed).
 */
const Attendance = require('../models/attendance.model');
const User = require('../models/user.model');
const pickerConfigService = require('./pickerConfig.service');
const locationService = require('./location.service');

const getSummary = async (userId, month, year) => {
  const m = month != null ? parseInt(month, 10) : new Date().getMonth();
  const y = year != null ? parseInt(year, 10) : new Date().getFullYear();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59);
  const list = await Attendance.find({
    userId,
    punchIn: { $gte: start, $lte: end },
  })
    .lean()
    .sort({ punchIn: -1 });

  let warehouseLabel = 'Warehouse';
  try {
    const locData = await locationService.getCurrentLocationForUser(userId);
    if (locData?.hubName && String(locData.hubName).trim()) {
      warehouseLabel = String(locData.hubName).trim();
    } else {
      const user = await User.findById(userId).select('locationType').lean();
      const loc = user?.locationType;
      warehouseLabel = loc === 'darkstore' ? 'Dark store' : 'Warehouse';
    }
  } catch {
    try {
      const user = await User.findById(userId).select('locationType').lean();
      const loc = user?.locationType;
      warehouseLabel = loc === 'darkstore' ? 'Dark store' : 'Warehouse';
    } catch {
      warehouseLabel = 'Warehouse';
    }
  }

  const details = list.map((a) => ({
    date: a.punchIn,
    punchIn: a.punchIn,
    punchOut: a.punchOut,
    totalHours: a.regularHours ?? 0,
    warehouse: warehouseLabel,
    orders: a.ordersCompleted ?? 0,
    incentive: 0,
    overtime: a.overtimeHours ?? null,
    status: a.status || 'present',
  }));
  return { details, ot: details.filter((d) => d.overtime > 0), history: details };
};

/** Dashboard stats: today's orders/earnings/incentives, weekly earnings series, performance */
const getStats = async (userId) => {
  const { basePayPerHour, overtimeMultiplier } = await pickerConfigService.getPayRates();
  const otRatePerHour = basePayPerHour * overtimeMultiplier;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const todayRecords = await Attendance.find({
    userId,
    punchIn: { $gte: todayStart, $lte: todayEnd },
  }).lean();

  let todayOrders = 0;
  let todayEarnings = 0;
  let todayIncentives = 0;
  for (const a of todayRecords) {
    todayOrders += a.ordersCompleted ?? 0;
    const reg = (a.regularHours ?? 0) * basePayPerHour;
    const ot = (a.overtimeHours ?? 0) * otRatePerHour;
    todayEarnings += reg + ot;
  }
  todayIncentives = Math.round(todayOrders * 2.5) || 0;

  // Determine if there is an active shift right now (punched in but not yet completed).
  // Treat ON_DUTY and ON_BREAK as active; fallback to punchOut === null for legacy records.
  let isShiftActive = false;
  let activeShiftStartTime = null;
  if (todayRecords.length) {
    const activeRecord =
      todayRecords.find(
        (a) =>
          !a.punchOut ||
          a.status === 'ON_DUTY' ||
          a.status === 'ON_BREAK'
      ) || null;
    if (activeRecord) {
      isShiftActive = true;
      activeShiftStartTime = activeRecord.punchIn instanceof Date
        ? activeRecord.punchIn.getTime()
        : new Date(activeRecord.punchIn).getTime();
    }
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyEarnings = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    const dayRecords = await Attendance.find({
      userId,
      punchIn: { $gte: dayStart, $lte: dayEnd },
    }).lean();
    let value = 0;
    for (const a of dayRecords) {
      value += (a.regularHours ?? 0) * basePayPerHour + (a.overtimeHours ?? 0) * otRatePerHour;
    }
    weeklyEarnings.push({ day: dayNames[d.getDay()], value: Math.round(value) });
  }

  const performance = {
    accuracy: todayRecords.length ? 98.5 : 0,
    speed: todayRecords.length ? 120 : 0,
    topPercent: todayRecords.length ? 10 : 0,
  };

  // Hub name from user's current location (Master Data), fallback to location type labels
  let hubName = null;
  if (todayRecords.length) {
    try {
      const locData = await locationService.getCurrentLocationForUser(userId);
      hubName = locData?.hubName?.trim() || null;
      if (!hubName) {
        const user = await User.findById(userId).select('locationType').lean();
        const loc = user?.locationType;
        hubName = loc === 'darkstore' ? 'Dark store' : 'Warehouse';
      }
    } catch {
      const user = await User.findById(userId).select('locationType').lean();
      const loc = user?.locationType;
      hubName = loc === 'darkstore' ? 'Dark store' : 'Warehouse';
    }
  }

  return {
    isShiftActive,
    activeShiftStartTime,
    todayOrders,
    todayEarnings: Math.round(todayEarnings),
    todayIncentives,
    weeklyEarnings,
    performance,
    hubName,
  };
};

module.exports = { getSummary, getStats };
