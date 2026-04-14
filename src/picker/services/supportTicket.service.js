/**
 * SupportTicket service – from backend-workflow.yaml (support_tickets_list, support_ticket_create).
 */
const SupportTicket = require('../models/supportTicket.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const list = async (userId) => {
  try {
    const list_ = await withTimeout(
      SupportTicket.find({ userId }).lean().sort({ createdAt: -1 }),
      DB_TIMEOUT_MS,
      []
    );
    return (list_ || []).map((t) => ({
      id: t._id.toString(),
      category: t.category,
      subject: t.subject,
      message: t.message,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  } catch (err) {
    console.warn('[support] list fallback:', err?.message);
    return [];
  }
};

const create = async (userId, body) => {
  const doc = await withTimeout(
    SupportTicket.create({
      userId,
      category: body.category || '',
      subject: body.subject || '',
      message: body.message || '',
      status: 'open',
    }),
    DB_TIMEOUT_MS
  );
  return {
    id: doc._id.toString(),
    category: doc.category,
    subject: doc.subject,
    message: doc.message,
    status: doc.status,
    createdAt: doc.createdAt,
  };
};

module.exports = { list, create };
