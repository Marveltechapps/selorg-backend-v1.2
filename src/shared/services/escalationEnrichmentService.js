const mongoose = require('mongoose');
const Rider = require('../../rider/models/Rider');
const WarehouseOrder = require('../../warehouse/models/Order');

const ORD_PATTERN = /ORD-[\w-]+/i;
const RIDER_PATTERN = /RIDER-\d+/i;

let DarkstoreOrder;
let CustomerOrder;
try {
  DarkstoreOrder = require('../../darkstore/models/Order');
} catch {
  DarkstoreOrder = null;
}
try {
  CustomerOrder = require('../../customer-backend/models/Order');
} catch {
  CustomerOrder = null;
}

function extractOrderDisplayId(description) {
  if (typeof description !== 'string') return null;
  return description.match(ORD_PATTERN)?.[0] || null;
}

function extractRiderStringId(description) {
  if (typeof description !== 'string') return null;
  return description.match(RIDER_PATTERN)?.[0] || null;
}

function formatIssueTypeLabel(type) {
  if (!type || typeof type !== 'string') return '';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function timelineToAttemptLogs(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) return [];
  return timeline.map((entry, index) => ({
    attempt: index + 1,
    timestamp: entry.time || entry.timestamp || entry.createdAt || null,
    outcome: entry.status || entry.outcome || 'unknown',
    notes: entry.note || entry.notes || entry.updatedBy || '',
  }));
}

function pickOrderDisplayId(order) {
  if (!order) return null;
  return order.id || order.order_id || order.orderNumber || null;
}

function pickCustomerFromOrder(order) {
  if (!order) return { customerName: null, customerPhone: null };
  return {
    customerName: order.customerName || order.customer_name || null,
    customerPhone: order.customer_phone || order.customerPhone || null,
  };
}

function indexOrders(orders) {
  const map = new Map();
  orders.forEach((order) => {
    const displayId = pickOrderDisplayId(order);
    if (displayId) map.set(displayId, order);
    if (order.order_id) map.set(order.order_id, order);
    if (order.id) map.set(order.id, order);
    if (order.orderNumber) map.set(order.orderNumber, order);
    if (order._id) map.set(String(order._id), order);
  });
  return map;
}

async function loadOrdersForEscalations(escalations) {
  const displayIds = new Set();
  const objectIds = [];

  escalations.forEach((esc) => {
    const fromDesc = extractOrderDisplayId(esc.description);
    if (fromDesc) displayIds.add(fromDesc);
    if (esc.orderDisplayId) displayIds.add(esc.orderDisplayId);
    if (esc.orderId) {
      const oid = String(esc.orderId);
      if (mongoose.Types.ObjectId.isValid(oid) && String(new mongoose.Types.ObjectId(oid)) === oid) {
        objectIds.push(new mongoose.Types.ObjectId(oid));
      } else if (ORD_PATTERN.test(oid)) {
        displayIds.add(oid);
      }
    }
  });

  const idList = [...displayIds];
  const results = [];

  if (idList.length) {
    results.push(
      await WarehouseOrder.find({
        $or: [{ id: { $in: idList } }, { order_id: { $in: idList } }],
      }).lean()
    );
    if (DarkstoreOrder) {
      results.push(
        await DarkstoreOrder.find({
          $or: [{ order_id: { $in: idList } }, { id: { $in: idList } }],
        }).lean()
      );
    }
    if (CustomerOrder) {
      results.push(await CustomerOrder.find({ orderNumber: { $in: idList } }).lean());
    }
  }

  if (objectIds.length && CustomerOrder) {
    results.push(await CustomerOrder.find({ _id: { $in: objectIds } }).lean());
  }

  return indexOrders(results.flat());
}

async function loadRidersForEscalations(escalations, orderByKey) {
  const mongoIds = new Set();
  const stringIds = new Set();

  escalations.forEach((esc) => {
    if (esc.riderId && mongoose.Types.ObjectId.isValid(String(esc.riderId))) {
      mongoIds.add(String(esc.riderId));
    }
    const fromDesc = extractRiderStringId(esc.description);
    if (fromDesc) stringIds.add(fromDesc);
  });

  orderByKey.forEach((order) => {
    if (order.riderId) stringIds.add(order.riderId);
  });

  const filters = [];
  if (mongoIds.size) filters.push({ _id: { $in: [...mongoIds] } });
  if (stringIds.size) filters.push({ id: { $in: [...stringIds] } });

  if (!filters.length) return new Map();

  const riders = await Rider.find(filters.length === 1 ? filters[0] : { $or: filters })
    .select('id name _id')
    .lean();

  const map = new Map();
  riders.forEach((rider) => {
    map.set(rider.id, rider);
    map.set(String(rider._id), rider);
  });
  return map;
}

function resolveOrderForEscalation(escalation, orderByKey) {
  const fromDesc = extractOrderDisplayId(escalation.description);
  const candidates = [
    escalation.orderDisplayId,
    fromDesc,
    escalation.orderId ? String(escalation.orderId) : null,
  ].filter(Boolean);

  for (const key of candidates) {
    const order = orderByKey.get(key);
    if (order) return { order, displayId: pickOrderDisplayId(order) || fromDesc || key };
  }

  if (fromDesc) return { order: null, displayId: fromDesc };
  return { order: null, displayId: null };
}

function resolveRiderForEscalation(escalation, order, riderByKey) {
  if (escalation.riderName) {
    return {
      riderId: escalation.riderId ? String(escalation.riderId) : extractRiderStringId(escalation.description),
      riderName: escalation.riderName,
    };
  }

  const keys = [
    escalation.riderId ? String(escalation.riderId) : null,
    extractRiderStringId(escalation.description),
    order?.riderId,
  ].filter(Boolean);

  for (const key of keys) {
    const rider = riderByKey.get(key);
    if (rider) {
      return { riderId: rider.id, riderName: rider.name };
    }
  }

  return { riderId: keys[0] || '', riderName: '' };
}

function serializeEscalation(escalation, orderByKey, riderByKey) {
  const { order, displayId } = resolveOrderForEscalation(escalation, orderByKey);
  const rider = resolveRiderForEscalation(escalation, order, riderByKey);
  const customer = pickCustomerFromOrder(order);
  const attemptLogs =
    Array.isArray(escalation.attemptLogs) && escalation.attemptLogs.length > 0
      ? escalation.attemptLogs
      : timelineToAttemptLogs(order?.timeline);

  return {
    _id: escalation._id,
    orderId: displayId || '',
    orderObjectId: escalation.orderId || null,
    ticketId: escalation.ticketId || null,
    riderId: rider.riderId || '',
    riderName: rider.riderName || '',
    issueType: escalation.type,
    issueTypeLabel: formatIssueTypeLabel(escalation.type),
    type: escalation.type,
    targetTeam: escalation.targetTeam,
    status: escalation.status,
    priority: escalation.priority,
    description: escalation.description,
    customerName: customer.customerName,
    customerPhone: customer.customerPhone,
    attemptLogs,
    resolutionNotes: escalation.resolutionNotes || '',
    assignedTo: escalation.assignedTo,
    assignedStoreName: escalation.assignedStoreName,
    storeId: escalation.storeId,
    createdAt: escalation.createdAt,
    updatedAt: escalation.updatedAt,
    resolvedAt: escalation.resolvedAt,
  };
}

async function enrichEscalations(escalations) {
  if (!Array.isArray(escalations) || escalations.length === 0) return [];

  const orderByKey = await loadOrdersForEscalations(escalations);
  const riderByKey = await loadRidersForEscalations(escalations, orderByKey);

  return escalations.map((esc) => serializeEscalation(esc, orderByKey, riderByKey));
}

async function enrichEscalationById(escalation) {
  if (!escalation) return null;
  const [enriched] = await enrichEscalations([escalation]);
  return enriched;
}

module.exports = {
  enrichEscalations,
  enrichEscalationById,
  extractOrderDisplayId,
  formatIssueTypeLabel,
};
