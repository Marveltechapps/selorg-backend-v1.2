const pickerOpsService = require('../services/pickerOps.service');
const { getTokensForPicker } = require('../../picker/services/pickerNotification.service');
const logger = require('../../core/utils/logger');

async function listPickers(req, res, next) {
  try {
    const { q, status, page, limit } = req.query;
    const data = await pickerOpsService.listPickers({ q, status: status || 'all', page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function updateAssignment(req, res, next) {
  try {
    const { pickerId } = req.params;
    const { agencyId, storeId, shiftSlotId } = req.body || {};
    await pickerOpsService.updatePickerAssignment(pickerId, { agencyId, storeId, shiftSlotId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function updateOpsStatus(req, res, next) {
  try {
    const { pickerId } = req.params;
    const { status, reason } = req.body || {};
    const approvedBy = req.user?.userId || req.user?.id;
    await pickerOpsService.updatePickerOpsStatus(pickerId, { status, reason }, approvedBy, req);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function updateStatusUnified(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ success: false, error: { message: 'status is required' } });
    }

    // New ops status format
    if (['pending', 'approved', 'rejected', 'deactivated'].includes(String(status))) {
      const approvedBy = req.user?.userId || req.user?.id;
      await pickerOpsService.updatePickerOpsStatus(id, { status, reason: req.body?.reason }, approvedBy, req);
      return res.json({ success: true });
    }

    // Legacy approvals format (PickerStatus)
    const pickerApprovalsService = require('../services/pickerApprovals.service');
    const approvedBy = req.user?.userId || req.user?.id;
    const updated = await pickerApprovalsService.updatePickerStatus(
      id,
      { status, rejectedReason: req.body?.rejectedReason },
      approvedBy,
      req
    );
    if (!updated) return res.status(404).json({ success: false, error: { message: 'Picker not found' } });
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function listAgencies(req, res, next) {
  try {
    const data = await pickerOpsService.listAgencies();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createAgency(req, res, next) {
  try {
    await pickerOpsService.createAgency(req.body);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function deactivateAgency(req, res, next) {
  try {
    const { agencyId } = req.params;
    await pickerOpsService.deactivateAgency(agencyId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function listStoreShiftSlots(req, res, next) {
  try {
    const { storeId } = req.params;
    const data = await pickerOpsService.listStoreShiftSlots(storeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createStoreShiftSlot(req, res, next) {
  try {
    const { storeId } = req.params;
    await pickerOpsService.createStoreShiftSlot(storeId, req.body);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function listOtRequests(req, res, next) {
  try {
    const data = await pickerOpsService.listOtRequests();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function decideOtRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const { decision, reason } = req.body || {};
    const decidedBy = req.user?.userId || req.user?.id || null;
    await pickerOpsService.decideOtRequest(requestId, decision, reason, decidedBy);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function listShiftChangeRequests(req, res, next) {
  try {
    const data = await pickerOpsService.listShiftChangeRequests();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function decideShiftChangeRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const { decision, reason } = req.body || {};
    const decidedBy = req.user?.userId || req.user?.id || null;
    await pickerOpsService.decideShiftChangeRequest(requestId, decision, reason, decidedBy);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

function toCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
  return str;
}

async function exportAttendanceCsv(req, res, next) {
  try {
    const { month, agencyId } = req.query;
    const rows = await pickerOpsService.getAttendanceByMonth({
      month: String(month || ''),
      agencyId: agencyId && String(agencyId) !== 'all' ? String(agencyId) : null,
    });
    const header = ['Picker Name', 'Days Worked', 'Regular Hours', 'OT Hours', 'Agency'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [r.pickerName, r.daysWorked, r.regularHours, r.otHours, r.agency || ''].map(toCsvCell).join(',')
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="picker-attendance-${month}.csv"`);
    res.status(200).send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
}

async function sendPickerPush(req, res, next) {
  try {
    const { pickerId } = req.params;
    const { title, body } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ success: false, error: { message: 'title and body are required' } });
    }

    // Reuse existing Expo push implementation by calling its internal flow.
    // `sendOrderAssignedPush` is exported; for generic pushes we re-send via the same tokens.
    const tokens = await getTokensForPicker(pickerId);
    if (!tokens || tokens.length === 0) {
      return res.json({ success: true, delivered: 0 });
    }

    // Hack-free way would be to export a generic push helper from pickerNotification.service,
    // but keep this minimal: reuse sendOrderAssignedPush when title/body match isn't possible.
    // Instead, perform a lightweight request to Expo directly here.
    const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
    const messages = tokens.map((t) => ({
      to: t,
      sound: 'default',
      title: String(title),
      body: String(body),
      data: { type: 'ADMIN_MESSAGE' },
      priority: 'high',
    }));
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) headers['Authorization'] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const expoRes = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    const result = await expoRes.json().catch(() => ({}));
    if (!expoRes.ok) {
      logger.warn('Admin push failed', { status: expoRes.status, result });
      return res.status(502).json({ success: false, error: { message: 'Push delivery failed' } });
    }
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPickers,
  updateAssignment,
  updateOpsStatus,
  updateStatusUnified,
  listAgencies,
  createAgency,
  deactivateAgency,
  listStoreShiftSlots,
  createStoreShiftSlot,
  listOtRequests,
  decideOtRequest,
  listShiftChangeRequests,
  decideShiftChangeRequest,
  exportAttendanceCsv,
  sendPickerPush,
};

