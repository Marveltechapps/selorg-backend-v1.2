const mongoose = require('mongoose');
const GRN = require('../models/GRN');
const DockSlot = require('../models/DockSlot');
const ErrorResponse = require("../../core/utils/ErrorResponse");
const warehouseNotificationService = require('./warehouseNotificationService');
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

/**
 * @desc Inbound Operations Service
 * Handles business logic for GRNs and Dock management
 */
const DEFAULT_DOCK_SLOTS = [
  { id: 'DOCK-1', name: 'Dock 1', status: 'empty' },
  { id: 'DOCK-2', name: 'Dock 2', status: 'empty' },
  { id: 'DOCK-3', name: 'Dock 3', status: 'empty' },
  { id: 'DOCK-4', name: 'Dock 4', status: 'empty' },
];

/** Processing queue: active work first, completed last. */
const GRN_STATUS_ORDER = { pending: 0, 'in-progress': 1, discrepancy: 2, completed: 3 };

function grnIdQuery(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
    ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
    : { id };
}

function grnTimestamp(grn) {
  const ts = grn.timestamp ?? grn.createdAt ?? grn.updatedAt;
  return ts ? new Date(ts).getTime() : 0;
}

function sortGrnsForQueue(items) {
  return [...items].sort((a, b) => {
    const orderA = GRN_STATUS_ORDER[a.status] ?? 99;
    const orderB = GRN_STATUS_ORDER[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const ta = grnTimestamp(a);
    const tb = grnTimestamp(b);
    if (a.status === 'completed') return tb - ta;
    return ta - tb;
  });
}

async function findGrnOrThrow(warehouseKey, id) {
  const grn = await GRN.findOne(mergeWarehouseFilter(grnIdQuery(id), warehouseKey));
  if (!grn) throw new ErrorResponse(`GRN not found with id ${id}`, 404);
  return grn;
}

async function findDockOrThrow(warehouseKey, dockId) {
  const dock = await DockSlot.findOne(mergeWarehouseFilter({ id: dockId }, warehouseKey));
  if (!dock) throw new ErrorResponse(`Dock not found with id ${dockId}`, 404);
  return dock;
}

async function findFirstEmptyDock(warehouseKey) {
  const docks = await DockSlot.find(mergeWarehouseFilter({ status: 'empty' }, warehouseKey))
    .sort({ name: 1 })
    .limit(20);
  return docks.find((d) => !d.grnId) || null;
}

async function releaseDockSlot(dock) {
  if (!dock) return;
  dock.status = 'empty';
  dock.grnId = undefined;
  dock.vendor = undefined;
  dock.truck = undefined;
  dock.eta = undefined;
  await dock.save();
}

/** Clear dock assignment and return linked GRN to the processing queue when applicable */
async function unassignGrnFromDock(warehouseKey, dock) {
  if (!dock?.grnId) {
    await releaseDockSlot(dock);
    return;
  }
  const grn = await GRN.findOne(mergeWarehouseFilter({ id: dock.grnId }, warehouseKey));
  if (grn) {
    grn.dockId = undefined;
    if (grn.status === 'in-progress' || grn.status === 'discrepancy') {
      grn.status = 'pending';
    }
    await grn.save();
  }
  await releaseDockSlot(dock);
}

function grnToSummary(grn) {
  if (!grn) return null;
  const doc = grn.toObject ? grn.toObject() : grn;
  return {
    id: doc.id,
    poNumber: doc.poNumber,
    vendor: doc.vendor,
    status: doc.status,
    items: doc.items ?? 0,
    timestamp: doc.timestamp ?? doc.createdAt,
    dockId: doc.dockId,
    discrepancyNotes: doc.discrepancyNotes,
    discrepancyType: doc.discrepancyType,
  };
}

function dockToDto(dock, activeGrn) {
  const doc = dock.toObject ? dock.toObject() : dock;
  return {
    id: doc.id,
    name: doc.name,
    status: doc.status,
    truck: doc.truck,
    vendor: doc.vendor,
    eta: doc.eta,
    grnId: doc.grnId,
    activeGrn: activeGrn || null,
  };
}

const inboundService = {
  /**
   * Live inbound KPIs for dashboard cards
   */
  getInboundSummary: async (warehouseKey) => {
    const scoped = (filter) => mergeWarehouseFilter(filter, warehouseKey);

    const pendingGRNs = await GRN.countDocuments(scoped({ status: 'pending' }));
    const inProgressGRNs = await GRN.countDocuments(scoped({ status: 'in-progress' }));

    const putawayAgg = await GRN.aggregate([
      { $match: scoped({ status: 'completed' }) },
      { $group: { _id: null, totalItems: { $sum: { $ifNull: ['$items', 0] } }, grnCount: { $sum: 1 } } },
    ]);
    const putawayPendingItems = putawayAgg[0]?.totalItems ?? 0;
    const putawayPendingGrns = putawayAgg[0]?.grnCount ?? 0;

    const dockTotal = await DockSlot.countDocuments(warehouseKeyMatch(warehouseKey));
    const dockActive = await DockSlot.countDocuments(scoped({ status: 'active' }));
    const dockUtilizationPercent =
      dockTotal > 0 ? Math.round((dockActive / dockTotal) * 100) : 0;

    return {
      pendingGRNs,
      inProgressGRNs,
      putawayPendingItems,
      putawayPendingGrns,
      dockTotal,
      dockActive,
      dockUtilizationPercent,
    };
  },

  /**
   * List GRNs with optional filters
   */
  listGRNs: async (warehouseKey, filters = {}) => {
    const {
      status,
      page = 1,
      limit = 50,
    } = filters;

    const query = {};
    if (status) query.status = status;
    if (filters.queueOnly === true || filters.queueOnly === 'true') {
      query.status = 'pending';
    }

    const skip = (page - 1) * limit;
    const scopedQuery = mergeWarehouseFilter(query, warehouseKey);
    const total = await GRN.countDocuments(scopedQuery);
    const items = sortGrnsForQueue(
      await GRN.find(scopedQuery).skip(skip).limit(limit).lean()
    );

    return {
      items,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Create a new GRN
   */
  nextGrnId: async (warehouseKey) => {
    const docs = await GRN.find(warehouseKeyMatch(warehouseKey), { id: 1 }).lean();
    let max = 0;
    for (const doc of docs) {
      const match = String(doc.id || '').match(/^GRN-(\d+)$/i);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return `GRN-${String(max + 1).padStart(3, '0')}`;
  },

  createGRN: async (warehouseKey, grnData) => {
    const poNumber = String(grnData?.poNumber || grnData?.po_number || '').trim();
    const vendor = String(grnData?.vendor || grnData?.supplier || '').trim();
    const items = Number(grnData?.items ?? grnData?.items_count ?? 0);

    if (!poNumber) {
      throw new ErrorResponse('poNumber is required to create GRN', 400);
    }
    if (!vendor) {
      throw new ErrorResponse('vendor is required to create GRN', 400);
    }
    if (!Number.isFinite(items) || items < 0) {
      throw new ErrorResponse('items must be a valid non-negative number', 400);
    }

    const requestedId =
      typeof grnData?.id === 'string' && grnData.id.trim() ? grnData.id.trim() : null;
    const id = requestedId || (await inboundService.nextGrnId(warehouseKey));

    const grn = await GRN.create({
      id,
      poNumber,
      vendor,
      items,
      status: 'pending',
      timestamp: new Date(),
      ...warehouseFieldsForCreate(warehouseKey),
    });
    warehouseNotificationService.notifyGrnCreated(warehouseKey, grn).catch(() => {});
    return grn;
  },

  /**
   * Get GRN by ID (supports string id e.g. GRN-001 or MongoDB ObjectId)
   */
  getGRNById: async (warehouseKey, id) => findGrnOrThrow(warehouseKey, id),

  /**
   * Start counting: assign GRN to a dock (pending/discrepancy → in-progress on dock schedule)
   */
  startCounting: async (warehouseKey, id, options = {}) => {
    await inboundService.ensureDefaultDocks(warehouseKey);
    const grn = await findGrnOrThrow(warehouseKey, id);

    if (grn.status === 'completed') {
      throw new ErrorResponse('Cannot start counting on a completed GRN', 400);
    }
    if (grn.status === 'in-progress') {
      throw new ErrorResponse('GRN is already assigned to a dock', 400);
    }
    if (grn.status !== 'pending' && grn.status !== 'discrepancy') {
      throw new ErrorResponse(`Cannot start counting from status: ${grn.status}`, 400);
    }

    let dock;
    const requestedDockId =
      typeof options.dockId === 'string' && options.dockId.trim() ? options.dockId.trim() : null;

    if (grn.status === 'discrepancy' && grn.dockId) {
      dock = await findDockOrThrow(warehouseKey, grn.dockId);
    } else if (grn.status === 'pending' && grn.dockId) {
      dock = await findDockOrThrow(warehouseKey, grn.dockId);
      if (dock.grnId && dock.grnId !== grn.id) {
        throw new ErrorResponse(`${dock.name} is already in use by another GRN`, 409);
      }
    } else if (requestedDockId) {
      dock = await findDockOrThrow(warehouseKey, requestedDockId);
      if (dock.status === 'offline') {
        throw new ErrorResponse(`${dock.name} is offline. Choose another dock.`, 400);
      }
      if (dock.grnId && dock.grnId !== grn.id) {
        throw new ErrorResponse(`${dock.name} is already in use`, 409);
      }
    } else {
      dock = await findFirstEmptyDock(warehouseKey);
      if (!dock) {
        throw new ErrorResponse('No empty docks available. Free a dock or mark one empty first.', 400);
      }
    }

    grn.status = 'in-progress';
    grn.dockId = dock.id;
    await grn.save();

    dock.status = 'active';
    dock.grnId = grn.id;
    dock.vendor = grn.vendor;
    const truck = String(options.truck ?? '').trim();
    const eta = String(options.eta ?? '').trim();
    if (truck) dock.truck = truck;
    if (eta) dock.eta = eta;
    await dock.save();

    return { grn, dock: dockToDto(dock, grnToSummary(grn)) };
  },

  /**
   * Complete a GRN (in-progress or discrepancy → completed / putaway queue)
   */
  completeGRN: async (warehouseKey, id) => {
    const grn = await findGrnOrThrow(warehouseKey, id);

    if (grn.status === 'completed') {
      throw new ErrorResponse('GRN is already completed', 400);
    }
    if (grn.status === 'pending') {
      throw new ErrorResponse('Start counting before completing this GRN', 400);
    }
    if (grn.status !== 'in-progress' && grn.status !== 'discrepancy') {
      throw new ErrorResponse(`Cannot complete GRN from status: ${grn.status}`, 400);
    }

    const dockId = grn.dockId;
    grn.status = 'completed';
    grn.dockId = undefined;
    await grn.save();

    if (dockId) {
      try {
        const dock = await findDockOrThrow(warehouseKey, dockId);
        if (dock.grnId === grn.id) await releaseDockSlot(dock);
      } catch {
        /* dock may have been removed */
      }
    }

    warehouseNotificationService.notifyGrnCompleted(warehouseKey, grn).catch(() => {});
    return grn;
  },

  /**
   * Log discrepancy for a GRN (in-progress → discrepancy, or update existing)
   */
  logDiscrepancy: async (warehouseKey, id, discrepancyData) => {
    const grn = await findGrnOrThrow(warehouseKey, id);

    if (grn.status === 'completed') {
      throw new ErrorResponse('Cannot log discrepancy on a completed GRN', 400);
    }
    if (grn.status === 'pending') {
      throw new ErrorResponse('Start counting before reporting a discrepancy', 400);
    }
    if (grn.status !== 'in-progress' && grn.status !== 'discrepancy') {
      throw new ErrorResponse(`Cannot log discrepancy from status: ${grn.status}`, 400);
    }

    const notes = String(discrepancyData?.notes ?? '').trim();
    const type = String(discrepancyData?.type ?? '').trim();
    if (!notes) {
      throw new ErrorResponse('Discrepancy notes are required', 400);
    }
    if (!type) {
      throw new ErrorResponse('Discrepancy type is required', 400);
    }

    grn.status = 'discrepancy';
    grn.discrepancyNotes = notes;
    grn.discrepancyType = type;
    await grn.save();

    if (grn.dockId) {
      try {
        const dock = await findDockOrThrow(warehouseKey, grn.dockId);
        dock.status = 'active';
        dock.grnId = grn.id;
        dock.vendor = grn.vendor;
        await dock.save();
      } catch {
        /* ignore */
      }
    }

    warehouseNotificationService.notifyGrnDiscrepancy(warehouseKey, grn).catch(() => {});
    return grn;
  },

  /**
   * Seed default dock slots when none exist for this warehouse
   */
  ensureDefaultDocks: async (warehouseKey) => {
    const total = await DockSlot.countDocuments(warehouseKeyMatch(warehouseKey));
    if (total > 0) return;
    const scope = warehouseFieldsForCreate(warehouseKey);
    await DockSlot.insertMany(
      DEFAULT_DOCK_SLOTS.map((dock) => ({ ...dock, ...scope }))
    );
  },

  /**
   * List Dock Slots
   */
  listDocks: async (warehouseKey, pagination = {}) => {
    await inboundService.ensureDefaultDocks(warehouseKey);
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;
    const total = await DockSlot.countDocuments(warehouseKeyMatch(warehouseKey));
    const docks = await DockSlot.find(warehouseKeyMatch(warehouseKey))
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    const grnIds = docks.map((d) => d.grnId).filter(Boolean);
    const grnDocs =
      grnIds.length > 0
        ? await GRN.find(mergeWarehouseFilter({ id: { $in: grnIds } }, warehouseKey)).lean()
        : [];
    const grnById = Object.fromEntries(grnDocs.map((g) => [g.id, g]));

    const items = docks.map((dock) =>
      dockToDto(dock, dock.grnId ? grnToSummary(grnById[dock.grnId]) : null)
    );

    return {
      items,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Update Dock status
   */
  updateDock: async (warehouseKey, id, dockData) => {
    const dock = await findDockOrThrow(warehouseKey, id);
    const nextStatus = dockData?.status;

    if (dockData?.status === 'empty') {
      await unassignGrnFromDock(warehouseKey, dock);
      return dockToDto(dock, null);
    }

    if (typeof dockData?.truck === 'string') dock.truck = dockData.truck.trim() || undefined;
    if (typeof dockData?.eta === 'string') dock.eta = dockData.eta.trim() || undefined;
    if (typeof dockData?.vendor === 'string' && !dock.grnId) {
      dock.vendor = dockData.vendor.trim() || undefined;
    }
    if (nextStatus === 'active' || nextStatus === 'offline' || nextStatus === 'empty') {
      dock.status = nextStatus;
    }

    await dock.save();

    let activeGrn = null;
    if (dock.grnId) {
      const grn = await GRN.findOne(mergeWarehouseFilter({ id: dock.grnId }, warehouseKey)).lean();
      activeGrn = grnToSummary(grn);
    }
    return dockToDto(dock, activeGrn);
  },
};

module.exports = inboundService;

