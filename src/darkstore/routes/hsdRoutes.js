const express = require('express');
const router = express.Router();
const {
  getFleetOverview,
  getHsdUsers,
  registerDevice,
  assignDevice,
  unassignDevice,
  bulkResetDevices,
  getDeviceHistory,
  getLiveSessions,
  getDeviceActions,
  deviceControl,
  getIssues,
  reportIssue,
  getHSDLogs,
  sessionAction,
  createRequisition,
  getHSDUserList,
  getHsdUserDeviceOtp,
  generateHsdUserDeviceOtp,
} = require('../controllers/hsdController');

// GET /api/darkstore/hsd/fleet
router.get('/fleet', getFleetOverview);

// GET /api/darkstore/hsd/picker-users — pickers with device assignment (legacy)
router.get('/picker-users', getHsdUsers);

// POST /api/darkstore/hsd/devices/register
router.post('/devices/register', registerDevice);

// POST /api/darkstore/hsd/devices/:deviceId/assign
router.post('/devices/:deviceId/assign', assignDevice);

// POST /api/darkstore/hsd/devices/:deviceId/unassign
router.post('/devices/:deviceId/unassign', unassignDevice);

// POST /api/darkstore/hsd/devices/bulk-reset
router.post('/devices/bulk-reset', bulkResetDevices);

// GET /api/darkstore/hsd/devices/:deviceId/history
router.get('/devices/:deviceId/history', getDeviceHistory);

// GET /api/darkstore/hsd/sessions/live
router.get('/sessions/live', getLiveSessions);

// GET /api/darkstore/hsd/devices/:deviceId/actions
router.get('/devices/:deviceId/actions', getDeviceActions);

// POST /api/darkstore/hsd/devices/:deviceId/control
router.post('/devices/:deviceId/control', deviceControl);

// GET /api/darkstore/hsd/issues
router.get('/issues', getIssues);

// POST /api/darkstore/hsd/issues/report
router.post('/issues/report', reportIssue);

// GET /api/darkstore/hsd/logs
router.get('/logs', getHSDLogs);

// GET /api/darkstore/hsd/users — HSD User List (login sessions)
router.get('/users', getHSDUserList);

// GET /api/darkstore/hsd/users/:userId/device-request-otp — active 6-digit approval OTP
router.get('/users/:userId/device-request-otp', getHsdUserDeviceOtp);

// POST /api/darkstore/hsd/users/:userId/generate-device-otp — generate 6-digit approval OTP
router.post('/users/:userId/generate-device-otp', generateHsdUserDeviceOtp);

// POST /api/darkstore/hsd/sessions/:deviceId/action
router.post('/sessions/:deviceId/action', sessionAction);

// POST /api/darkstore/hsd/requisitions
router.post('/requisitions', createRequisition);

module.exports = router;

