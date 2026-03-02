const inboundService = require('../services/inboundService');

async function getOverview(req, res, next) {
  try {
    // simple aggregation of counts
    const overview = { totalGRNsToday: 0, pendingApproval: 0, approvedGRNs: 0, rejectedGRNs: 0, inTransitShipments: 0, exceptions: 0 };
    res.json(overview);
  } catch (err) {
    next(err);
  }
}

async function listGRNs(req, res, next) {
  try {
    const result = await inboundService.listGRNs(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createGRN(req, res, next) {
  try {
    const grn = await inboundService.createGRN(req.body);
    res.status(201).json(grn);
  } catch (err) {
    next(err);
  }
}

async function getGRN(req, res, next) {
  try {
    const grn = await inboundService.getGRNById(req.params.grnId);
    res.json(grn);
  } catch (err) {
    next(err);
  }
}

async function putGRN(req, res, next) {
  try {
    const grn = await inboundService.updateGRN(req.params.grnId, req.body);
    res.json(grn);
  } catch (err) {
    next(err);
  }
}

async function patchGRNStatus(req, res, next) {
  try {
    const grn = await inboundService.changeGRNStatus(req.params.grnId, req.body);
    res.json(grn);
  } catch (err) {
    next(err);
  }
}

async function approveGRN(req, res, next) {
  try {
    const grn = await inboundService.approveGRN(req.params.grnId);
    res.json(grn);
  } catch (err) {
    next(err);
  }
}

async function rejectGRN(req, res, next) {
  try {
    // Accept reason from multiple possible fields to be tolerant of client payloads
    const reason = (req.body && (req.body.reason || req.body.rejectionReason || req.body.note)) || req.query.reason;
    if (!reason || (typeof reason === 'string' && reason.trim() === '')) {
      const err = new Error('Reason required for rejection');
      err.status = 400;
      throw err;
    }
    const result = await inboundService.rejectGRN(req.params.grnId, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listShipments(req, res, next) {
  try {
    // simple passthrough
    const data = await require('../models/Shipment').find({}).lean();
    res.json({ data, pagination: { page: 1, limit: data.length, total: data.length, pages: 1 } });
  } catch (err) {
    next(err);
  }
}

async function createShipment(req, res, next) {
  try {
    const s = await inboundService.createShipment(req.body);
    res.status(201).json(s);
  } catch (err) {
    next(err);
  }
}

async function patchShipmentStatus(req, res, next) {
  try {
    const s = await inboundService.updateShipmentStatus(req.params.shipmentId, req.body);
    res.json(s);
  } catch (err) {
    next(err);
  }
}

async function listExceptions(req, res, next) {
  try {
    const list = await inboundService.listExceptions(req.query);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function createException(req, res, next) {
  try {
    const ex = await inboundService.createException(req.body);
    res.status(201).json(ex);
  } catch (err) {
    next(err);
  }
}

async function resolveException(req, res, next) {
  try {
    const ex = await inboundService.resolveException(req.params.exceptionId, req.body);
    res.json(ex);
  } catch (err) {
    next(err);
  }
}

async function createImportJob(req, res, next) {
  try {
    const job = await inboundService.createImportJob();
    res.status(202).json(job);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
  listGRNs,
  createGRN,
  getGRN,
  putGRN,
  patchGRNStatus,
  approveGRN,
  rejectGRN,
  listShipments,
  createShipment,
  patchShipmentStatus,
  listExceptions,
  createException,
  resolveException,
  createImportJob,
};

