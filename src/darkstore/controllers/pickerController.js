/**
 * Picker Controller
 * Handles all picker-related business logic with real DB operations
 */

const mongoose = require('mongoose');
const PickerUser = require('../../picker/models/user.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');
const pickerMetricsService = require('../services/pickerMetricsService');
const { deriveWorkerStatus } = require('../../picker/controllers/heartbeat.controller');
const { getPickerIdsInActiveShift } = require('../services/activeShiftHelper');

const DEFAULT_STORE = process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';

function toFrontendPicker(doc) {
  if (!doc) return null;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: d.id,
    name: d.name,
    avatar: d.avatar || (d.name || '?').slice(0, 2).toUpperCase(),
    status: d.status || 'available',
    zoneExpertise: d.zone_expertise || [],
  };
}

/**
 * Get Live Pickers (PickerUser workforce with heartbeat data)
 * Worker Status Engine: derivedStatus = AVAILABLE | PICKING | ON_BREAK | OFFLINE
 * Only includes pickers who are in an active shift (punched in).
 * GET /api/v1/darkstore/pickers/live
 */
const getPickersLive = async (req, res) => {
  try {
    const [pickers, inShiftIds] = await Promise.all([
      PickerUser.find({ status: PICKER_STATUS.ACTIVE })
        .select('name phone lastSeenAt batteryLevel activeOrderId onBreak')
        .lean(),
      getPickerIdsInActiveShift(),
    ]);

    const now = Date.now();
    const data = pickers
      .filter((p) => inShiftIds.has(String(p._id)))
      .map((p) => {
        const derivedStatus = deriveWorkerStatus(p, now);
        const online = derivedStatus !== 'OFFLINE';

        return {
          id: String(p._id),
          name: p.name || p.phone || 'Unknown',
          online,
          derivedStatus,
          batteryLevel: p.batteryLevel ?? null,
          activeOrderId: p.activeOrderId || null,
          lastActivity: p.lastSeenAt || null,
        };
      });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch live pickers',
    });
  }
};

/**
 * Get Available Pickers (for manual assign in Live Orders / dashboard)
 * Uses PickerUser (HHD/Picker workforce) - same pool as auto-assign.
 * Only returns pickers who are in an active shift (punched in).
 * GET /api/v1/darkstore/pickers/available
 */
const getAvailablePickers = async (req, res) => {
  try {
    const storeId = req.query.storeId || null;
    const query = { status: PICKER_STATUS.ACTIVE };
    if (storeId) query.currentLocationId = storeId;

    const [pickers, inShiftIds] = await Promise.all([
      PickerUser.find(query)
        .select('name phone lastSeenAt activeOrderId')
        .lean(),
      getPickerIdsInActiveShift(),
    ]);

    const now = Date.now();
    const data = pickers
      .filter((p) => inShiftIds.has(String(p._id)))
      .map((p) => {
        const derivedStatus = deriveWorkerStatus(p, now);
        const online = derivedStatus !== 'OFFLINE';
        return {
          id: String(p._id),
          name: p.name || p.phone || 'Unknown',
          avatar: (p.name || p.phone || '?').slice(0, 2).toUpperCase(),
          status: online ? (p.activeOrderId ? 'busy' : 'available') : 'offline',
        };
      });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch available pickers',
    });
  }
};

/**
 * Get Picker Performance
 * GET /api/v1/darkstore/pickers/:id/performance
 * Query: startDate, endDate (ISO date strings)
 */
const getPickerPerformance = async (req, res) => {
  try {
    const { id } = req.params;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = req.query.endDate || new Date().toISOString().slice(0, 10);

    const pickerId = mongoose.Types.ObjectId.isValid(id) ? id : null;
    if (!pickerId) {
      return res.status(400).json({ success: false, error: 'Invalid picker id' });
    }

    const picker = await PickerUser.findById(pickerId).select('name phone').lean();
    if (!picker) {
      return res.status(404).json({ success: false, error: 'Picker not found' });
    }

    const performance = await pickerMetricsService.getPickerPerformance(pickerId, startDate, endDate);
    return res.status(200).json({
      success: true,
      data: {
        ...performance,
        pickerName: picker.name || picker.phone || 'Unknown',
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch picker performance',
    });
  }
};

/**
 * List Pickers (with optional risk=high filter)
 * GET /api/v1/darkstore/pickers?risk=high&startDate=...&endDate=...
 */
const listPickers = async (req, res) => {
  try {
    const riskFilter = req.query.risk === 'high' ? 'high' : null;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = req.query.endDate || new Date().toISOString().slice(0, 10);

    const pickers = await pickerMetricsService.listPickersWithMetrics(startDate, endDate, riskFilter);
    return res.status(200).json({
      success: true,
      data: pickers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list pickers',
    });
  }
};

/**
 * Get Picker Performance Summary KPIs
 * GET /api/v1/darkstore/pickers/performance/summary
 */
const getPerformanceSummary = async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = req.query.endDate || new Date().toISOString().slice(0, 10);

    const summary = await pickerMetricsService.getPerformanceSummary(startDate, endDate);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch performance summary',
    });
  }
};

module.exports = {
  getAvailablePickers,
  getPickersLive,
  getPickerPerformance,
  listPickers,
  getPerformanceSummary,
};
