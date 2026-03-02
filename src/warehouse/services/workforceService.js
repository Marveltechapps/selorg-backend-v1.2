const Staff = require('../models/Staff');
const Shift = require('../models/Shift');
const WarehouseShiftSlot = require('../models/WarehouseShiftSlot');
const WarehouseTraining = require('../models/WarehouseTraining');
const WarehouseAttendance = require('../models/WarehouseAttendance');
const ErrorResponse = require("../../core/utils/ErrorResponse");

/**
 * @desc Warehouse Workforce Service
 */
const workforceService = {
  listStaff: async () => {
    const staff = await Staff.find({ 
      $or: [
        { role: /warehouse/i },
        { role: 'Picker' },
        { role: 'Packer' },
        { role: 'Loader' },
        { role: 'Supervisor' },
        { role: 'Forklift Operator' },
        { role: 'QC Inspector' },
        { role: 'Warehouse Manager' }
      ]
    }).sort({ name: 1 }).lean();
    // Transform to match frontend Staff interface
    return staff.map(s => ({
      id: s.id,
      name: s.name,
      role: s.role,
      shift: s.shift || 'morning',
      status: s.status === 'Active' ? 'active' : s.status === 'Break' ? 'break' : 'offline',
      productivity: s.productivity || 85 + Math.floor(Math.random() * 15),
      email: s.email || `${s.name.toLowerCase().replace(' ', '.')}@warehouse.com`,
      phone: s.phone || '+91-XXXXX-XXXXX',
      joinDate: s.joinDate || (s.joinedAt ? new Date(s.joinedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      hourlyRate: s.hourlyRate || 250
    }));
  },

  getStaffById: async (id) => {
    const staff = await Staff.findOne({ id });
    if (!staff) throw new ErrorResponse(`Staff member not found with id ${id}`, 404);
    return staff;
  },

  addStaff: async (data) => {
    const count = await Staff.countDocuments();
    const id = data.id || `STAFF-${(count + 1).toString().padStart(3, '0')}`;
    const staffData = {
      id,
      name: data.name,
      role: data.role || 'Picker',
      status: 'Offline',
      shift: data.shift || 'morning',
      email: data.email || '',
      phone: data.phone || '',
      joinDate: data.joinDate || new Date().toISOString().split('T')[0],
      joinedAt: data.joinDate ? new Date(data.joinDate) : new Date(),
      productivity: data.productivity || 0,
      hourlyRate: data.hourlyRate || 0
    };
    const staff = await Staff.create(staffData);
    return {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      shift: staff.shift || 'morning',
      status: 'active',
      productivity: staff.productivity || 0,
      email: staff.email || '',
      phone: staff.phone || '',
      joinDate: staff.joinDate || (staff.joinedAt ? new Date(staff.joinedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      hourlyRate: staff.hourlyRate || 0
    };
  },

  listShifts: async () => {
    const shifts = await WarehouseShiftSlot.find().sort({ date: -1 }).lean();
    // Transform to match frontend ShiftSchedule interface
    return shifts.map(s => ({
      id: s.id,
      date: s.date ? (typeof s.date === 'string' ? s.date : new Date(s.date).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      shift: s.shift || 'morning',
      staffAssigned: s.assignedStaff || [],
      requiredStaff: s.requiredStaff || s.staffCount || 5,
      status: s.assignedStaff && s.assignedStaff.length >= (s.requiredStaff || s.staffCount || 5) 
        ? 'full' 
        : s.assignedStaff && s.assignedStaff.length > 0 
        ? 'understaffed' 
        : 'understaffed'
    }));
  },

  listAttendance: async (filters = {}) => {
    const WarehouseAttendance = require('../models/WarehouseAttendance');
    const Staff = require('../models/Staff');
    const { page = 1, limit = 50, staffId } = filters;
    const query = {};
    if (staffId) query.staffId = staffId;
    const skip = (page - 1) * limit;
    const total = await WarehouseAttendance.countDocuments(query);
    const items = await WarehouseAttendance.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean();

    // Fetch all staff to map names
    const allStaff = await Staff.find({}).select('id name').lean();
    const staffMap = allStaff.reduce((map, s) => {
      map[s.id] = s.name;
      return map;
    }, {});

    // Map to frontend Attendance interface
    return {
      items: items.map(a => ({
        id: a.id,
        staffId: a.staffId,
        staffName: staffMap[a.staffId] || a.staffId,
        date: a.timestamp ? new Date(a.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        checkIn: a.status === 'check-in' ? new Date(a.timestamp).toLocaleTimeString() : '--:--',
        checkOut: a.status === 'check-out' ? new Date(a.timestamp).toLocaleTimeString() : '--:--',
        status: a.status === 'check-in' ? 'present' : 'present',
        hoursWorked: a.status === 'check-out' ? 8 : 0 // Mocking hours for check-out
      })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    };
  },

  listPerformance: async (filters = {}) => {
    // Heuristic performance: count completed picklists per staff in last 7 days
    const Picklist = require('../models/Picklist');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const agg = await Picklist.aggregate([
      { $match: { status: 'completed', updatedAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$picker', tasks: { $sum: 1 } } },
      { $sort: { tasks: -1 } },
      { $limit: 10 }
    ]);
    return agg.map((row, idx) => ({
      id: `PERF-${idx + 1}`,
      staffId: row._id || `STAFF-${idx + 1}`,
      staffName: row._id || `Staff ${idx + 1}`,
      role: 'Picker',
      weeklyTarget: 20,
      weeklyActual: row.tasks,
      accuracy: 98 + Math.floor(Math.random() * 2),
      avgSpeed: 80 + Math.floor(Math.random() * 20),
      rating: Math.min(5, 3 + Math.round((row.tasks / 10)))
    }));
  },

  listLeaveRequests: async (filters = {}) => {
    const LeaveRequest = require('../models/LeaveRequest');
    const { page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;
    const total = await LeaveRequest.countDocuments();
    const items = await LeaveRequest.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    return {
      items: items.map(l => ({
        id: l.id,
        staffId: l.staffId,
        staffName: l.staffName,
        leaveType: l.leaveType,
        startDate: l.startDate ? new Date(l.startDate).toISOString().split('T')[0] : '',
        endDate: l.endDate ? new Date(l.endDate).toISOString().split('T')[0] : '',
        days: l.days,
        status: l.status,
        reason: l.reason
      })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    };
  },

  createLeaveRequest: async (data) => {
    const LeaveRequest = require('../models/LeaveRequest');
    const Staff = require('../models/Staff');
    
    // Validate staff exists
    const staff = await Staff.findOne({ id: data.staffId });
    if (!staff) throw new ErrorResponse(`Staff member not found with id ${data.staffId}`, 404);
    
    if (!data.id) {
      const count = await LeaveRequest.countDocuments();
      data.id = `LR-${(count + 1).toString().padStart(3, '0')}`;
    }
    
    data.staffName = staff.name;
    
    // Calculate days if not provided
    if (!data.days && data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      data.days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    
    return await LeaveRequest.create(data);
  },

  updateLeaveStatus: async (id, status) => {
    const LeaveRequest = require('../models/LeaveRequest');
    const leave = await LeaveRequest.findOne({ id });
    if (!leave) throw new ErrorResponse(`Leave request not found with id ${id}`, 404);
    
    leave.status = status;
    await leave.save();
    return leave;
  },

  createShift: async (data) => {
    if (!data.id) {
      const count = await WarehouseShiftSlot.countDocuments();
      data.id = `SHIFT-${(count + 1).toString().padStart(3, '0')}`;
    }
    const slotData = {
      id: data.id,
      date: data.date ? new Date(data.date) : new Date(),
      shift: data.shift || 'morning',
      requiredStaff: data.requiredStaff || 4,
      assignedStaff: data.staffAssigned || data.assignedStaff || []
    };
    const slot = await WarehouseShiftSlot.create(slotData);
    return {
      id: slot.id,
      date: slot.date ? new Date(slot.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      shift: slot.shift || 'morning',
      requiredStaff: slot.requiredStaff || 4,
      staffAssigned: slot.assignedStaff || [],
      status: (slot.assignedStaff && slot.assignedStaff.length >= (slot.requiredStaff || 4)) ? 'full' : 'understaffed'
    };
  },

  assignStaffToShift: async (shiftId, staffIds) => {
    const shift = await WarehouseShiftSlot.findOne({ id: shiftId });
    if (!shift) throw new ErrorResponse(`Shift not found with id ${shiftId}`, 404);
    
    // Set the assigned staff to the provided list
    shift.assignedStaff = staffIds || [];
    await shift.save();
    return {
      id: shift.id,
      date: shift.date ? new Date(shift.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      shift: shift.shift || 'morning',
      requiredStaff: shift.requiredStaff || 4,
      staffAssigned: shift.assignedStaff || [],
      status: (shift.assignedStaff && shift.assignedStaff.length >= (shift.requiredStaff || 4)) ? 'full' : 'understaffed'
    };
  },

  listTrainings: async () => {
    const trainings = await WarehouseTraining.find().sort({ date: 1 }).lean();
    return trainings.map(t => ({
      id: t.id,
      trainingId: t.trainingId,
      title: t.title,
      type: t.type,
      date: t.date ? new Date(t.date).toISOString().split('T')[0] : '',
      duration: t.duration || 'N/A',
      instructor: t.instructor || 'Unassigned',
      enrolled: t.enrolled || 0,
      capacity: t.capacity || 20,
      status: t.status === 'upcoming' ? 'scheduled' : (t.status === 'ongoing' ? 'in-progress' : t.status)
    }));
  },

  getTrainingById: async (id) => {
    const t = await WarehouseTraining.findOne({ id }).lean();
    if (!t) throw new ErrorResponse(`Training session not found with id ${id}`, 404);
    return {
      id: t.id,
      trainingId: t.trainingId,
      title: t.title,
      type: t.type,
      date: t.date ? new Date(t.date).toISOString().split('T')[0] : '',
      duration: t.duration || 'N/A',
      instructor: t.instructor || 'Unassigned',
      enrolled: t.enrolled || 0,
      capacity: t.capacity || 20,
      status: t.status === 'upcoming' ? 'scheduled' : (t.status === 'ongoing' ? 'in-progress' : t.status),
      description: t.description || ''
    };
  },

  enrollInTraining: async (trainingId, staffIds) => {
    const training = await WarehouseTraining.findOne({ id: trainingId });
    if (!training) throw new ErrorResponse(`Training session not found with id ${trainingId}`, 404);
    
    training.enrolledStaff = [...new Set([...(training.enrolledStaff || []), ...staffIds])];
    training.enrolled = training.enrolledStaff.length;
    await training.save();
    return training;
  },

  logAttendance: async (data) => {
    if (!data.id) {
      const count = await WarehouseAttendance.countDocuments();
      data.id = `ATT-${(count + 1).toString().padStart(3, '0')}`;
    }
    return await WarehouseAttendance.create(data);
  }
};

module.exports = workforceService;

