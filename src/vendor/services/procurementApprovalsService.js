const ProcurementApproval = require('../models/ProcurementApproval');
const logger = require('../../core/utils/logger');

function toTask(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(d._id),
    type: d.type,
    description: d.description,
    details: d.details,
    requesterName: d.requesterName,
    requesterRole: d.requesterRole,
    valueAmount: d.valueAmount,
    currency: d.currency || 'INR',
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    status: d.status,
    priority: d.priority || 'normal',
    relatedIds: d.relatedIds || {},
    rejectionReason: d.rejectionReason,
    decisionNote: d.decisionNote,
    approvedAt: d.approvedAt ? new Date(d.approvedAt).toISOString() : undefined,
  };
}

async function getSummary() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [pendingRequestsCount, approvedTodayCount, rejectedTodayCount] = await Promise.all([
      ProcurementApproval.countDocuments({ status: 'pending' }),
      ProcurementApproval.countDocuments({
        status: 'approved',
        approvedAt: { $gte: today, $lt: tomorrow },
      }),
      ProcurementApproval.countDocuments({
        status: 'rejected',
        approvedAt: { $gte: today, $lt: tomorrow },
      }),
    ]);

    return {
      pendingRequestsCount: pendingRequestsCount ?? 0,
      approvedTodayCount: approvedTodayCount ?? 0,
      rejectedTodayCount: rejectedTodayCount ?? 0,
    };
  } catch (error) {
    logger.error('Error getting procurement approval summary:', error);
    throw error;
  }
}

async function listTasks(filters = {}) {
  try {
    const { status = 'pending', type, minValue } = filters;
    const query = {};

    if (status !== 'all') {
      query.status = status;
    }
    if (type && type !== 'all') {
      query.type = type;
    }
    if (minValue != null && minValue > 0) {
      query.valueAmount = { $gte: minValue };
    }

    const docs = await ProcurementApproval.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(200)
      .lean();

    return docs.map((d) => toTask({ ...d, _id: d._id }));
  } catch (error) {
    logger.error('Error listing procurement tasks:', error);
    throw error;
  }
}

async function getTaskById(id) {
  try {
    const doc = await ProcurementApproval.findById(id).lean();
    if (!doc) return null;
    return toTask({ ...doc, _id: doc._id });
  } catch (error) {
    logger.error('Error getting procurement task:', error);
    throw error;
  }
}

async function submitDecision(id, payload, userId = 'system') {
  try {
    const task = await ProcurementApproval.findById(id);
    if (!task) {
      throw new Error('Task not found');
    }
    if (task.status !== 'pending') {
      throw new Error('Task has already been processed');
    }

    task.status = payload.decision === 'approve' ? 'approved' : 'rejected';
    task.decisionNote = payload.note;
    task.rejectionReason = payload.reason;
    task.approvedAt = new Date();
    task.approvedBy = userId;

    await task.save();
    return toTask(task);
  } catch (error) {
    logger.error('Error submitting procurement decision:', error);
    throw error;
  }
}

module.exports = {
  getSummary,
  listTasks,
  getTaskById,
  submitDecision,
};
