const accessService = require('../services/accessService');

const listRiderAccess = async (req, res, next) => {
  try {
    const { appAccess, deviceAssigned, riderId, page, limit } = req.query;
    const result = await accessService.listRiderAccess(
      { appAccess, deviceAssigned, riderId },
      { page, limit }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateRiderAccess = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const { appAccess } = req.body;
    const result = await accessService.updateRiderAccess(riderId, { appAccess });
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }
    next(error);
  }
};

const assignDevice = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const deviceData = req.body;
    const result = await accessService.assignDevice(riderId, deviceData);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }
    next(error);
  }
};

const unassignDevice = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const result = await accessService.unassignDevice(riderId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

module.exports = {
  listRiderAccess,
  updateRiderAccess,
  assignDevice,
  unassignDevice,
};
