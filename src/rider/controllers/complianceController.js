const complianceService = require('../services/complianceService');

const listComplianceAlerts = async (req, res, next) => {
  try {
    const { status, riderId, page, limit } = req.query;
    const result = await complianceService.listComplianceAlerts(
      { status, riderId },
      { page, limit }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRiderSuspension = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const result = await complianceService.getRiderSuspension(riderId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const manageSuspension = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const { action, reason, durationDays } = req.body;
    const result = await complianceService.manageSuspension(riderId, {
      action,
      reason,
      durationDays,
    });
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

const getRiderViolations = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const result = await complianceService.getRiderViolations(riderId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

module.exports = {
  listComplianceAlerts,
  getRiderSuspension,
  manageSuspension,
  getRiderViolations,
};
