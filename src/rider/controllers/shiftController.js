const shiftService = require('../services/shiftService');

function handleError(res, err) {
  const statusMap = {
    INVALID_TIME_WINDOW: 400,
    NO_SHIFTS_SELECTED: 400,
    NO_VALID_SHIFTS: 400,
    SHIFT_NOT_FOUND: 404,
    SHIFT_OVERLAP: 400,
    CAPACITY_REACHED: 409,
    SHIFT_NOT_SELECTED: 400,
    OUTSIDE_START_WINDOW: 400,
    SHIFT_NOT_STARTED: 400,
  };

  const status = statusMap[err.code] || 500;
  return res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
    code: err.code,
  });
}

async function list(req, res) {
  try {
    const { date, hubId, status, page, limit } = req.query;
    const result = await shiftService.listShifts(
      { date, hubId, status },
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined }
    );
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

async function create(req, res) {
  try {
    const payload = req.body || {};
    if (!payload.id) {
      payload.id = `RSHIFT-${Date.now()}`;
    }
    const shift = await shiftService.createShift(payload);
    res.status(201).json({ success: true, data: shift });
  } catch (err) {
    handleError(res, err);
  }
}

async function getById(req, res) {
  try {
    const shift = await shiftService.getShiftById(req.params.id);
    if (!shift) {
      return res.status(404).json({ success: false, error: 'Shift not found' });
    }
    res.json({ success: true, data: shift });
  } catch (err) {
    handleError(res, err);
  }
}

async function update(req, res) {
  try {
    const shift = await shiftService.updateShift(req.params.id, req.body || {});
    if (!shift) {
      return res.status(404).json({ success: false, error: 'Shift not found' });
    }
    res.json({ success: true, data: shift });
  } catch (err) {
    handleError(res, err);
  }
}

async function remove(req, res) {
  try {
    const shift = await shiftService.deleteShift(req.params.id);
    if (!shift) {
      return res.status(404).json({ success: false, error: 'Shift not found' });
    }
    res.json({ success: true, data: shift });
  } catch (err) {
    handleError(res, err);
  }
}

async function getAvailable(req, res) {
  try {
    const riderId = req.user?.id || req.query.riderId;
    if (!riderId) {
      return res.status(400).json({ success: false, error: 'Missing riderId' });
    }
    const { date } = req.query;
    const shifts = await shiftService.getAvailableForRider(riderId, { date });
    res.json({ success: true, data: shifts });
  } catch (err) {
    handleError(res, err);
  }
}

async function select(req, res) {
  try {
    const riderId = req.user?.id || req.body.riderId;
    if (!riderId) {
      return res.status(400).json({ success: false, error: 'Missing riderId' });
    }
    const { selectedShifts } = req.body;
    await shiftService.selectShifts(riderId, selectedShifts);
    res.json({ success: true, data: {} });
  } catch (err) {
    handleError(res, err);
  }
}

async function cancel(req, res) {
  try {
    const riderId = req.user?.id || req.body.riderId;
    if (!riderId) {
      return res.status(400).json({ success: false, error: 'Missing riderId' });
    }
    const { shiftId } = req.body;
    if (!shiftId) {
      return res.status(400).json({ success: false, error: 'Missing shiftId' });
    }
    await shiftService.cancelShiftSelection(riderId, shiftId);
    res.json({ success: true, data: {} });
  } catch (err) {
    handleError(res, err);
  }
}

async function start(req, res) {
  try {
    const riderId = req.user?.id || req.body.riderId;
    if (!riderId) {
      return res.status(400).json({ success: false, error: 'Missing riderId' });
    }
    const { shiftId, timestamp } = req.body;
    const result = await shiftService.startShift(
      riderId,
      shiftId,
      timestamp ? new Date(timestamp) : undefined
    );
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

async function end(req, res) {
  try {
    const riderId = req.user?.id || req.body.riderId;
    if (!riderId) {
      return res.status(400).json({ success: false, error: 'Missing riderId' });
    }
    const { shiftId, timestamp } = req.body;
    await shiftService.endShift(riderId, shiftId, timestamp ? new Date(timestamp) : undefined);
    res.json({ success: true, data: {} });
  } catch (err) {
    handleError(res, err);
  }
}

async function myShifts(req, res) {
  try {
    const riderId = req.user?.id || req.query.riderId;
    if (!riderId) {
      return res.status(400).json({ success: false, error: 'Missing riderId' });
    }
    const { date, status } = req.query;
    const data = await shiftService.listRiderShifts(riderId, { date, status });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = {
  list,
  create,
  getById,
  update,
  remove,
  getAvailable,
  select,
  cancel,
  start,
  end,
  myShifts,
};

