const express = require('express');
const router = express.Router();
const {
  getFleetOverview,
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
} = require('../controllers/hsdController');

// GET /api/darkstore/hsd/fleet
router.get('/fleet', getFleetOverview);

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

// POST /api/darkstore/hsd/sessions/:deviceId/action
router.post('/sessions/:deviceId/action', sessionAction);

// POST /api/darkstore/hsd/requisitions
router.post('/requisitions', createRequisition);

module.exports = router;

