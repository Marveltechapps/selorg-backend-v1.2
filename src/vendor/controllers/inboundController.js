const inboundService = require('../services/inboundService');
const { mergeHubFilter } = require('../constants/hubScope');
const GRN = require('../models/GRN');
const Shipment = require('../models/Shipment');
const Exception = require('../models/Exception');

async function getOverview(req, res, next) {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const createdToday = { createdAt: { $gte: start, $lte: end } };

    const [
      totalGRNsToday,
      pendingApproval,
      approvedGRNs,
      rejectedGRNs,
      inTransitShipments,
      exceptions,
    ] = await Promise.all([
      GRN.countDocuments(mergeHubFilter({ ...createdToday, status: { $ne: 'ARCHIVED' } })),
      GRN.countDocuments(mergeHubFilter({ status: 'PENDING' })),
      GRN.countDocuments(mergeHubFilter({ status: 'APPROVED' })),
      GRN.countDocuments(mergeHubFilter({ status: 'REJECTED' })),
      Shipment.countDocuments(
        mergeHubFilter({ status: { $in: ['IN_TRANSIT', 'IN TRANSIT'] } })
      ),
      Exception.countDocuments(mergeHubFilter({ status: 'OPEN' })),
    ]);

    res.json({
      totalGRNsToday,
      pendingApproval,
      approvedGRNs,
      rejectedGRNs,
      inTransitShipments,
      exceptions,
    });
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
    const grn = await inboundService.approveGRN(req.params.grnId, req.body || {});
    res.json(grn);
  } catch (err) {
    next(err);
  }
}

async function rejectGRN(req, res, next) {
  try {
    const reason =
      (req.body &&
        (req.body.reason ||
          req.body.description ||
          req.body.rejectionReason ||
          req.body.note)) ||
      req.query.reason;
    if (!reason || (typeof reason === 'string' && reason.trim() === '')) {
      const err = new Error('Reason required for rejection');
      err.status = 400;
      return next(err);
    }
    const result = await inboundService.rejectGRN(req.params.grnId, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function archiveGRN(req, res, next) {
  try {
    const grn = await inboundService.archiveGRN(req.params.grnId);
    res.json(grn);
  } catch (err) {
    next(err);
  }
}

async function listShipments(req, res, next) {
  try {
    const data = await Shipment.find(mergeHubFilter({})).sort({ createdAt: -1 }).lean();
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
    const ex = await inboundService.resolveException(req.params.exceptionId);
    res.json(ex);
  } catch (err) {
    next(err);
  }
}

async function listRTVs(req, res, next) {
  try {
    const list = await inboundService.listRTVs();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function createRTV(req, res, next) {
  try {
    const rtv = await inboundService.createRTV(req.body);
    res.status(201).json(rtv);
  } catch (err) {
    next(err);
  }
}

async function patchRTVStatus(req, res, next) {
  try {
    const rtv = await inboundService.updateRTVStatus(req.params.rtvId, req.body);
    res.json(rtv);
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

async function getImportJobStatus(req, res, next) {
  try {
    const job = await inboundService.getImportJobStatus(req.params.jobId);
    res.json(job);
  } catch (err) {
    next(err);
  }
}

async function exportReport(req, res, next) {
  try {
    const csv = await inboundService.exportGrnReport();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vendor-inbound-grns.csv"');
    res.send(csv);
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
  archiveGRN,
  listShipments,
  createShipment,
  patchShipmentStatus,
  listExceptions,
  createException,
  resolveException,
  listRTVs,
  createRTV,
  patchRTVStatus,
  createImportJob,
  getImportJobStatus,
  exportReport,
};
