const FraudAlert = require('../models/FraudAlert');
const BlockedEntity = require('../models/BlockedEntity');
const FraudRule = require('../models/FraudRule');
const RiskProfile = require('../models/RiskProfile');
const FraudPattern = require('../models/FraudPattern');
const FraudInvestigation = require('../models/FraudInvestigation');
const Chargeback = require('../models/Chargeback');
const mongoose = require('mongoose');
const { asyncHandler } = require('../../core/middleware');

function toAlert(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    alertNumber: d.alertNumber,
    type: d.type,
    severity: d.severity,
    status: d.status,
    customerId: d.customerId,
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    description: d.description,
    detectedAt: d.createdAt?.toISOString?.() || d.detectedAt,
    resolvedAt: d.resolvedAt?.toISOString?.(),
    assignedTo: d.assignedTo?.toString?.(),
    assignedToName: d.assignedTo?.name,
    riskScore: d.riskScore,
    evidence: (d.evidence || []).map(e => ({
      id: e._id?.toString?.() || e.id,
      type: e.type,
      description: e.description,
      timestamp: e.timestamp?.toISOString?.(),
      data: e.data,
    })),
    actions: d.actions || [],
    orderNumbers: d.orderNumbers || [],
    amountInvolved: d.amountInvolved,
    deviceId: d.deviceId,
    ipAddress: d.ipAddress,
    location: d.location,
  };
}

function toBlockedEntity(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    type: d.type,
    value: d.value,
    reason: d.reason,
    blockedBy: d.blockedBy,
    blockedByName: d.blockedByName,
    blockedAt: d.createdAt?.toISOString?.() || d.blockedAt,
    expiresAt: d.expiresAt?.toISOString?.(),
    isPermanent: d.isPermanent,
    relatedAlerts: d.relatedAlerts || [],
    notes: d.notes,
  };
}

function toRule(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    name: d.name,
    type: d.type,
    condition: d.condition,
    threshold: d.threshold,
    action: d.action,
    isActive: d.isActive,
    priority: d.priority,
    triggeredCount: d.triggeredCount || 0,
    falsePositiveRate: d.falsePositiveRate || 0,
    createdAt: d.createdAt?.toISOString?.(),
    lastTriggered: d.lastTriggered?.toISOString?.(),
  };
}

function toRiskProfile(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    entityType: d.entityType,
    entityId: d.entityId,
    entityName: d.entityName,
    riskScore: d.riskScore,
    riskLevel: d.riskLevel,
    factors: (d.factors || []).map(f => ({
      name: f.name,
      score: f.score,
      weight: f.weight,
      description: f.description,
    })),
    totalOrders: d.totalOrders || 0,
    totalSpent: d.totalSpent || 0,
    refundRate: d.refundRate || 0,
    chargebackCount: d.chargebackCount || 0,
    accountAge: d.accountAge || 0,
    lastActivity: d.lastActivity?.toISOString?.(),
    flags: d.flags || [],
  };
}

function toFraudPattern(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    name: d.name,
    type: d.type,
    description: d.description,
    occurrences: d.occurrences || 0,
    totalLoss: d.totalLoss || 0,
    detectedCount: d.detectedCount || 0,
    preventedCount: d.preventedCount || 0,
    trend: d.trend || 'stable',
    lastDetected: d.lastDetected?.toISOString?.(),
    affectedCustomers: d.affectedCustomers || 0,
  };
}

function toInvestigation(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    caseNumber: d.caseNumber,
    title: d.title,
    type: d.type,
    status: d.status,
    priority: d.priority,
    investigator: d.investigator?.toString?.(),
    investigatorName: d.investigator?.name,
    openedAt: d.createdAt?.toISOString?.(),
    closedAt: d.closedAt?.toISOString?.(),
    customerId: d.customerId,
    customerName: d.customerName,
    totalLoss: d.totalLoss || 0,
    timeline: (d.timeline || []).map(t => ({
      id: t._id?.toString?.() || t.id,
      action: t.action,
      performedBy: t.performedBy?.toString?.(),
      performedByName: t.performedByName,
      timestamp: t.timestamp?.toISOString?.(),
      details: t.details,
    })),
    outcome: d.outcome,
  };
}

function toChargeback(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString(),
    chargebackId: d.chargebackId,
    orderId: d.orderId,
    customerId: d.customerId,
    customerName: d.customerName,
    amount: d.amount,
    reason: d.reason,
    status: d.status,
    receivedAt: d.createdAt?.toISOString?.() || d.receivedAt,
    dueDate: d.dueDate?.toISOString?.(),
    resolvedAt: d.resolvedAt?.toISOString?.(),
    merchantNotes: d.merchantNotes,
    evidence: d.evidence || [],
  };
}

const fraudController = {
  listAlerts: asyncHandler(async (req, res) => {
    const { status, severity, type, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (severity && severity !== 'all') filter.severity = severity;
    if (type && type !== 'all') filter.type = type;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [docs, total] = await Promise.all([
      FraudAlert.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      FraudAlert.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: docs.map(toAlert),
      meta: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) },
    });
  }),

  getAlert: asyncHandler(async (req, res) => {
    const doc = await FraudAlert.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: toAlert(doc) });
  }),

  updateAlert: asyncHandler(async (req, res) => {
    const doc = await FraudAlert.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: toAlert(doc) });
  }),

  listBlockedEntities: asyncHandler(async (req, res) => {
    const docs = await BlockedEntity.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: docs.map(toBlockedEntity) });
  }),

  createBlockedEntity: asyncHandler(async (req, res) => {
    const { type, value, reason, isPermanent, expiresAt, relatedAlerts, notes } = req.body;
    if (!type || !value || !reason) {
      return res.status(400).json({ success: false, message: 'type, value and reason are required' });
    }
    const userId = req.user?.userId || req.user?.id || 'system';
    const userName = req.user?.email || req.user?.name || 'System';
    const entity = await BlockedEntity.create({
      type,
      value,
      reason,
      blockedBy: userId,
      blockedByName: userName,
      isPermanent: !!isPermanent,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      relatedAlerts: relatedAlerts || [],
      notes,
    });
    res.status(201).json({ success: true, data: toBlockedEntity(entity) });
  }),

  unblockEntity: asyncHandler(async (req, res) => {
    const doc = await BlockedEntity.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Blocked entity not found' });
    res.json({ success: true, message: 'Entity unblocked' });
  }),

  listFraudRules: asyncHandler(async (req, res) => {
    let count = await FraudRule.countDocuments();
    if (count === 0) {
      await FraudRule.insertMany([
        { name: 'Velocity Limit - Orders', type: 'velocity', condition: 'Orders per hour > threshold', threshold: 5, action: 'flag', isActive: true, priority: 1 },
        { name: 'High Value Transaction', type: 'amount', condition: 'Order amount > threshold', threshold: 10000, action: 'review', isActive: true, priority: 2 },
        { name: 'Multiple Device Accounts', type: 'device', condition: 'Accounts per device > threshold', threshold: 3, action: 'block', isActive: true, priority: 1 },
        { name: 'Payment Failure Rate', type: 'behavior', condition: 'Failed payments > threshold', threshold: 5, action: 'alert', isActive: true, priority: 1 },
        { name: 'Geolocation Change', type: 'location', condition: 'Location change > threshold km', threshold: 500, action: 'flag', isActive: false, priority: 3 },
      ]);
    }
    const docs = await FraudRule.find({}).sort({ priority: 1, createdAt: 1 }).lean();
    res.json({ success: true, data: docs.map(toRule) });
  }),

  toggleFraudRule: asyncHandler(async (req, res) => {
    const doc = await FraudRule.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Rule not found' });
    doc.isActive = !doc.isActive;
    await doc.save();
    res.json({ success: true, data: toRule(doc) });
  }),

  listRiskProfiles: asyncHandler(async (req, res) => {
    const docs = await RiskProfile.find({}).sort({ riskScore: -1 }).lean();
    res.json({ success: true, data: docs.map(toRiskProfile) });
  }),

  listFraudPatterns: asyncHandler(async (req, res) => {
    const docs = await FraudPattern.find({}).sort({ occurrences: -1 }).lean();
    res.json({ success: true, data: docs.map(toFraudPattern) });
  }),

  listInvestigations: asyncHandler(async (req, res) => {
    const docs = await FraudInvestigation.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: docs.map(toInvestigation) });
  }),

  listChargebacks: asyncHandler(async (req, res) => {
    const docs = await Chargeback.find({}).sort({ dueDate: 1 }).lean();
    res.json({ success: true, data: docs.map(toChargeback) });
  }),

  updateChargeback: asyncHandler(async (req, res) => {
    const { status, merchantNotes, evidence } = req.body;
    const update = {};
    if (status) update.status = status;
    if (merchantNotes !== undefined) update.merchantNotes = merchantNotes;
    if (evidence) update.evidence = evidence;
    if (status === 'won' || status === 'lost') update.resolvedAt = new Date();
    const doc = await Chargeback.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Chargeback not found' });
    res.json({ success: true, data: toChargeback(doc) });
  }),

  getMetrics: asyncHandler(async (req, res) => {
    const [
      totalAlerts,
      openAlerts,
      resolvedAlerts,
      falsePositives,
      blockedCount,
      activeInvestigations,
      alertsForLoss,
    ] = await Promise.all([
      FraudAlert.countDocuments(),
      FraudAlert.countDocuments({ status: { $in: ['open', 'investigating'] } }),
      FraudAlert.countDocuments({ status: 'resolved' }),
      FraudAlert.countDocuments({ status: 'false_positive' }),
      BlockedEntity.countDocuments(),
      FraudInvestigation.countDocuments({ status: { $ne: 'closed' } }),
      FraudAlert.aggregate([
        { $match: { amountInvolved: { $exists: true, $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amountInvolved' } } },
      ]),
    ]);

    const totalLossIncurred = alertsForLoss[0]?.total || 0;
    const avgRisk = await FraudAlert.aggregate([
      { $group: { _id: null, avg: { $avg: '$riskScore' } } },
    ]);
    const averageRiskScore = Math.round(avgRisk[0]?.avg || 0);
    const chargebackCount = await Chargeback.countDocuments({ status: { $nin: ['won', 'lost'] } });
    const totalChargebacks = await Chargeback.countDocuments();
    const chargebackRate = totalChargebacks > 0 ? (chargebackCount / totalChargebacks) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalAlerts,
        openAlerts,
        resolvedAlerts,
        falsePositives,
        totalLossPrevented: 0,
        totalLossIncurred,
        averageRiskScore,
        blockedEntities: blockedCount,
        activeInvestigations,
        chargebackRate,
      },
    });
  }),
};

module.exports = fraudController;
