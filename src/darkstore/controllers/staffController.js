const Staff = require('../models/Staff');
const Absence = require('../models/Absence');
const ShiftCoverage = require('../models/ShiftCoverage');
const PeakHourAlert = require('../models/PeakHourAlert');
const WeeklyRoster = require('../models/WeeklyRoster');
const StaffPerformance = require('../models/StaffPerformance');
const EmployeeOfWeek = require('../models/EmployeeOfWeek');
const IncentiveCriteria = require('../models/IncentiveCriteria');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');

const getWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

const getStaffSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = date.toISOString().split('T')[0];

    const activeStaff = await Staff.countDocuments({
      store_id: storeId,
      status: 'Active',
    });

    const absencesToday = await Absence.countDocuments({
      store_id: storeId,
      date: { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59.999Z') },
    });

    const totalStaff = await Staff.countDocuments({ store_id: storeId });

    res.json({
      success: true,
      summary: {
        active_staff: activeStaff,
        absences_today: absencesToday,
        total_staff: totalStaff,
      },
      date: dateStr,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch staff summary',
    });
  }
};

const getStaffRoster = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const role = req.query.role || 'all';
    const status = req.query.status || 'all';
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (role !== 'all') {
      query.role = { $in: [role, role.toLowerCase()] };
    }
    if (status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [{ name: { $regex: search, $options: 'i' } }, { staff_id: { $regex: search, $options: 'i' } }];
    }

    const staff = await Staff.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Staff.countDocuments(query);

    res.json({
      success: true,
      staff: staff.map((s) => ({
        staff_id: s.staff_id,
        name: s.name,
        role: s.role,
        zone: s.zone,
        status: s.status,
        current_shift: s.current_shift,
        current_task: s.current_task,
        shift_start: s.shift_start,
        shift_end: s.shift_end,
      })),
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_items: total,
        items_per_page: limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch staff roster',
    });
  }
};

const getShiftCoverage = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = date.toISOString().split('T')[0];

    const coverage = await ShiftCoverage.find({
      store_id: storeId,
      date: { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59.999Z') },
    }).lean();

    const peakHourAlert = await PeakHourAlert.findOne({
      store_id: storeId,
      date: { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59.999Z') },
      enabled: true,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      coverage: coverage.map((c) => ({
        shift: c.shift,
        shift_label: c.shift_label,
        current_staff: c.current_staff,
        target_staff: c.target_staff,
        status: c.status,
      })),
      peak_hour_alert: peakHourAlert
        ? {
            enabled: peakHourAlert.enabled,
            time_range: peakHourAlert.time_range,
            recommended_staff: peakHourAlert.recommended_staff,
            message: peakHourAlert.message,
          }
        : {
            enabled: false,
            time_range: '',
            recommended_staff: 0,
            message: '',
          },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch shift coverage',
    });
  }
};

const getAbsences = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = date.toISOString().split('T')[0];
    const type = req.query.type || 'all';

    const query = {
      store_id: storeId,
      date: { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59.999Z') },
    };
    if (type !== 'all') {
      query.type = type;
    }

    const absences = await Absence.find(query).lean();

    const absencesWithStaff = await Promise.all(
      absences.map(async (absence) => {
        const staff = await Staff.findOne({ staff_id: absence.staff_id }).lean();
        return {
          staff_id: absence.staff_id,
          name: staff?.name || 'Unknown',
          role: staff?.role || 'Unknown',
          reason: absence.reason,
          type: absence.type,
          date: absence.date,
        };
      })
    );

    res.json({
      success: true,
      absences: absencesWithStaff,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch absences',
    });
  }
};

const logAbsence = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;
    const { staff_id, reason, type, date, notes } = req.body;

    const staff = await Staff.findOne({ staff_id, store_id: storeId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: `Staff member with ID ${staff_id} not found in this store`,
      });
    }

    const absenceId = `ABS-${Date.now().toString().slice(-6)}`;

    const absence = new Absence({
      absence_id: absenceId,
      staff_id,
      reason,
      type,
      date: new Date(date),
      notes,
      store_id: storeId,
    });

    await absence.save();

    // If staff was active, set to offline and decrement current shift coverage
    if (staff.status === 'Active' || staff.status === 'Break' || staff.status === 'Meeting') {
      const oldStatus = staff.status;
      staff.status = 'Offline';
      await staff.save();

      // Decrement coverage for current shift
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const todayStart = new Date(dateStr);
      const todayEnd = new Date(dateStr + 'T23:59:59.999Z');

      // Determine shift based on current time (matching seed script logic)
      const hour = now.getUTCHours();
      let currentShiftKey = 'morning';
      if (hour >= 6 && hour < 14) currentShiftKey = 'morning';
      else if (hour >= 14 && hour < 22) currentShiftKey = 'afternoon';
      else currentShiftKey = 'night';

      await ShiftCoverage.findOneAndUpdate(
        {
          store_id: storeId,
          date: { $gte: todayStart, $lt: todayEnd },
          shift: currentShiftKey
        },
        { $inc: { current_staff: -1 } }
      );
    }

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'create',
      module: 'staff',
      user: req.userId || 'system',
      action: 'LOG_ABSENCE',
      details: {
        staff_id,
        reason,
        type,
        date,
        store_id: storeId
      },
      store_id: storeId,
    });

    res.json({
      success: true,
      absence_id: absence.absence_id,
      message: 'Absence logged successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Invalid absence data',
    });
  }
};

const getWeeklyRoster = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const now = new Date();
    const week = parseInt(req.query.week) || getWeek(now);
    const year = parseInt(req.query.year) || now.getFullYear();

    const roster = await WeeklyRoster.find({
      store_id: storeId,
      week,
      year,
    }).lean();

    const rosterWithStaff = await Promise.all(
      roster.map(async (r) => {
        const staff = await Staff.findOne({ staff_id: r.staff_id }).lean();
        return {
          staff_id: r.staff_id,
          name: staff?.name || 'Unknown',
          role: staff?.role || 'Unknown',
          shifts: {
            monday: r.monday,
            tuesday: r.tuesday,
            wednesday: r.wednesday,
            thursday: r.thursday,
            friday: r.friday,
            saturday: r.saturday,
            sunday: r.sunday,
          },
        };
      })
    );

    res.json({
      success: true,
      week,
      year,
      roster: rosterWithStaff,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch weekly roster',
    });
  }
};

const publishRoster = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;
    const { week, year, notes } = req.body;

    await WeeklyRoster.updateMany(
      { store_id: storeId, week, year },
      { published_at: new Date(), notes }
    );

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'staff',
      user: req.userId || 'system',
      action: 'PUBLISH_ROSTER',
      details: {
        week,
        year,
        store_id: storeId
      },
      store_id: storeId,
    });

    res.json({
      success: true,
      message: 'Roster published successfully',
      published_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Roster already published or invalid data',
    });
  }
};

const autoAssignOT = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;
    const { time_range, required_staff, roles } = req.body;

    const availableStaff = await Staff.find({
      store_id: storeId,
      status: { $in: ['Active', 'Offline'] },
      role: { $in: roles },
    }).limit(required_staff);

    let assignedCount = 0;
    for (const staff of availableStaff) {
      staff.status = 'Active';
      await staff.save();
      assignedCount++;
    }

    // Update ShiftCoverage for today if applicable
    if (assignedCount > 0) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const todayStart = new Date(dateStr);
      const todayEnd = new Date(dateStr + 'T23:59:59.999Z');

      // Find the shift that overlaps with the current time or the requested time_range
      // For simplicity, we'll update the 'afternoon' shift if it's peak hour
      const shiftToUpdate = time_range && time_range.includes('18:00') ? 'afternoon' : 'morning';

      await ShiftCoverage.findOneAndUpdate(
        {
          store_id: storeId,
          date: { $gte: todayStart, $lt: todayEnd },
          shift: shiftToUpdate
        },
        { $inc: { current_staff: assignedCount } }
      );
    }

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'staff',
      user: req.userId || 'system',
      action: 'AUTO_ASSIGN_OT',
      details: {
        time_range,
        required_staff,
        assigned_count: assignedCount,
        roles,
        store_id: storeId
      },
      store_id: storeId,
    });

    res.json({
      success: true,
      assigned_shifts: assignedCount,
      message: `${assignedCount} overtime shifts assigned successfully`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Insufficient available staff',
    });
  }
};

const getPerformance = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const period = req.query.period || 'week';
    const sortBy = req.query.sort_by || 'productivity';

    const performance = await StaffPerformance.find({
      store_id: storeId,
      period,
    })
      .sort({ [sortBy === 'productivity' ? 'score' : sortBy === 'error_rate' ? 'error_rate' : 'score']: -1 })
      .lean();

    const avgProductivity = performance.reduce((sum, p) => sum + parseFloat(p.productivity.replace(/[^0-9.]/g, '') || 0), 0) / (performance.length || 1);
    const teamErrorRate = performance.reduce((sum, p) => sum + parseFloat(p.error_rate.replace(/[^0-9.]/g, '') || 0), 0) / (performance.length || 1);

    const now = new Date();
    const employeeOfWeek = await EmployeeOfWeek.findOne({
      store_id: storeId,
      week: getWeek(now),
      year: now.getFullYear(),
    }).lean();

    const incentiveCriteria = await IncentiveCriteria.find({ store_id: storeId }).lean();

    res.json({
      success: true,
      summary: {
        avg_productivity: Math.round(avgProductivity),
        team_error_rate: parseFloat(teamErrorRate.toFixed(1)),
        sla_breach_impact: 'Low',
        incentives_paid: 1240,
      },
      staff_performance: performance.map((p, index) => ({
        staff_id: p.staff_id,
        name: p.name,
        role: p.role,
        rank: index + 1,
        productivity: p.productivity,
        error_rate: p.error_rate,
        sla_impact: p.sla_impact,
        incentive_status: p.incentive_status,
        score: p.score,
      })),
      employee_of_week: employeeOfWeek
        ? {
            staff_id: employeeOfWeek.staff_id,
            name: employeeOfWeek.name,
            role: employeeOfWeek.role,
            productivity: employeeOfWeek.productivity,
            accuracy: employeeOfWeek.accuracy,
            week: employeeOfWeek.week,
            year: employeeOfWeek.year,
          }
        : null,
      incentive_criteria: incentiveCriteria.map((ic) => ({
        criterion: ic.criterion,
        reward: ic.reward,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch performance metrics',
    });
  }
};

const downloadPerformanceReport = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    
    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'data_push',
      module: 'staff',
      user: req.userId || 'system',
      action: 'DOWNLOAD_PERFORMANCE_REPORT',
      details: {
        store_id: storeId,
        period: req.query.period || 'week'
      },
      store_id: storeId,
    });

    // Mock PDF content for now
    const csvContent = "Rank,Employee,Role,Productivity,Error Rate,SLA Impact,Incentive\n" +
      "1,John Doe,Picker,125 UPH,0.5%,Low,Eligible\n" +
      "2,Jane Smith,Packer,140 UPH,0.8%,Low,Eligible\n" +
      "3,Mike Brown,Loader,95 UPH,1.2%,Medium,At Risk";

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=staff-performance-${new Date().toISOString().split('T')[0]}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate performance report',
    });
  }
};

module.exports = {
  getStaffSummary,
  getStaffRoster,
  getShiftCoverage,
  getAbsences,
  logAbsence,
  getWeeklyRoster,
  publishRoster,
  autoAssignOT,
  getPerformance,
  downloadPerformanceReport,
};

