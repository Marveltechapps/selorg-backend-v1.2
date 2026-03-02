const citywideService = require('../services/citywideService');
const ErrorResponse = require('../../core/utils/ErrorResponse');

const getCityId = (req) => req.query.cityId || req.body?.cityId || 'default';

// GET /merch/citywide/live-metrics
const getLiveMetrics = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getLiveMetrics(cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/zones
const getZones = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getZonesWithMetrics(cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/zones/:id
const getZoneDetail = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getZoneDetail(req.params.id, cityId);
    if (!data) {
      return next(new ErrorResponse(`Zone not found: ${req.params.id}`, 404));
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/zones/:id/trend
const getZoneOrderTrend = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getZoneOrderTrend(req.params.id, cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/incidents
const getIncidents = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const status = req.query.status || 'ongoing';
    const data = await citywideService.getIncidents(cityId, status);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/incidents/:id
const getIncidentById = async (req, res, next) => {
  try {
    const data = await citywideService.getIncidentById(req.params.id);
    if (!data) {
      return next(new ErrorResponse(`Incident not found: ${req.params.id}`, 404));
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// PATCH /merch/citywide/incidents/:id
const updateIncident = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.email || 'unknown';
    const data = await citywideService.updateIncident(req.params.id, req.body, userId);
    if (!data) {
      return next(new ErrorResponse(`Incident not found: ${req.params.id}`, 404));
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/exceptions
const getExceptions = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const limit = parseInt(req.query.limit, 10) || 20;
    const data = await citywideService.getExceptions(cityId, limit);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /merch/citywide/exceptions/:id/resolve
const resolveException = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.email || 'unknown';
    const resolution = req.body?.resolution;
    const data = await citywideService.resolveException(req.params.id, resolution, userId);
    if (!data) {
      return next(new ErrorResponse(`Exception not found: ${req.params.id}`, 404));
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/integration-health
const getIntegrationHealth = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getIntegrationHealth(cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/surge
const getSurge = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getSurgeConfig(cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// PUT /merch/citywide/surge
const updateSurge = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const userId = req.user?.id || req.user?.email || 'unknown';
    const data = await citywideService.updateSurgeConfig(cityId, req.body, userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// DELETE /merch/citywide/surge
const endSurge = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const userId = req.user?.id || req.user?.email || 'unknown';
    const data = await citywideService.endSurge(cityId, userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/dispatch
const getDispatch = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getDispatchConfig(cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// PATCH /merch/citywide/dispatch
const updateDispatch = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const userId = req.user?.id || req.user?.email || 'unknown';
    const data = await citywideService.updateDispatchConfig(cityId, req.body, userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /merch/citywide/dispatch/restart
const restartDispatch = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const userId = req.user?.id || req.user?.email || 'unknown';
    const data = await citywideService.restartDispatch(cityId, userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /merch/citywide/sla
const getSla = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const data = await citywideService.getSlaConfig(cityId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /merch/citywide/seed
const seedCitywide = async (req, res, next) => {
  try {
    const cityId = getCityId(req);
    const result = await citywideService.seedCitywideData(cityId);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getLiveMetrics,
  getZones,
  getZoneDetail,
  getZoneOrderTrend,
  restartDispatch,
  getIncidents,
  getIncidentById,
  updateIncident,
  getExceptions,
  resolveException,
  getIntegrationHealth,
  getSurge,
  updateSurge,
  endSurge,
  getDispatch,
  updateDispatch,
  getSla,
  seedCitywide,
};
