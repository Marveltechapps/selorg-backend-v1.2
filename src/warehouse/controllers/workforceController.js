const workforceService = require('../services/workforceService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Warehouse Workforce Controller
 */
const workforceController = {
  getStaff: asyncHandler(async (req, res) => {
    const staff = await workforceService.listStaff(req.user.warehouseKey);
    res.status(200).json({ success: true, count: staff.length, data: staff });
  }),

  getStaffDetails: asyncHandler(async (req, res) => {
    const staff = await workforceService.getStaffById(req.user.warehouseKey, req.params.id);
    res.status(200).json({ success: true, data: staff });
  }),

  addStaff: asyncHandler(async (req, res) => {
    const staff = await workforceService.addStaff(req.user.warehouseKey, req.body);
    res.status(201).json({ success: true, message: 'Staff added successfully', data: staff });
  }),

  getSchedule: asyncHandler(async (req, res) => {
    const shifts = await workforceService.listShifts(req.user.warehouseKey);
    res.status(200).json({ success: true, count: shifts.length, data: shifts });
  }),

  getAttendance: asyncHandler(async (req, res) => {
    const result = await workforceService.listAttendance(req.user.warehouseKey, req.query);
    res.status(200).json({ success: true, meta: { total: result.total, page: result.page, limit: result.limit }, data: result.items });
  }),

  getPerformance: asyncHandler(async (req, res) => {
    const result = await workforceService.listPerformance(req.user.warehouseKey, req.query);
    res.status(200).json({ success: true, data: result });
  }),

  getLeaveRequests: asyncHandler(async (req, res) => {
    const result = await workforceService.listLeaveRequests(req.user.warehouseKey, req.query);
    res.status(200).json({ success: true, meta: { total: result.total, page: result.page, limit: result.limit }, data: result.items });
  }),

  createLeaveRequest: asyncHandler(async (req, res) => {
    const leave = await workforceService.createLeaveRequest(req.user.warehouseKey, req.body);
    res.status(201).json({ success: true, message: 'Leave request created successfully', data: leave });
  }),

  updateLeaveStatus: asyncHandler(async (req, res) => {
    const leave = await workforceService.updateLeaveStatus(req.user.warehouseKey, req.params.id, req.body.status);
    res.status(200).json({ success: true, message: `Leave request ${req.body.status} successfully`, data: leave });
  }),

  createSchedule: asyncHandler(async (req, res) => {
    const shift = await workforceService.createShift(req.user.warehouseKey, req.body);
    res.status(201).json({ success: true, data: shift });
  }),

  assignStaff: asyncHandler(async (req, res) => {
    const shift = await workforceService.assignStaffToShift(req.user.warehouseKey, req.params.id, req.body.staffIds);
    res.status(200).json({ success: true, message: 'Staff assigned successfully', data: shift });
  }),

  getTrainings: asyncHandler(async (req, res) => {
    const trainings = await workforceService.listTrainings(req.user.warehouseKey);
    res.status(200).json({ success: true, count: trainings.length, data: trainings });
  }),

  getTrainingDetails: asyncHandler(async (req, res) => {
    const training = await workforceService.getTrainingById(req.user.warehouseKey, req.params.id);
    res.status(200).json({ success: true, data: training });
  }),

  enrollStaff: asyncHandler(async (req, res) => {
    const training = await workforceService.enrollInTraining(req.user.warehouseKey, req.params.id, req.body.staffIds);
    res.status(200).json({ success: true, message: 'Staff enrolled successfully', data: training });
  }),

  logAttendance: asyncHandler(async (req, res) => {
    const attendance = await workforceService.logAttendance(req.user.warehouseKey, req.body);
    res.status(201).json({ success: true, message: 'Attendance logged successfully', data: attendance });
  })
};

module.exports = workforceController;

