/**
 * SupportTicket controller – from backend-workflow.yaml (support_tickets_list, support_ticket_create).
 */
const supportTicketService = require('../services/supportTicket.service');
const { success, error } = require('../utils/response.util');

const list = async (req, res, next) => {
  try {
    const data = await supportTicketService.list(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { category, subject, message } = req.body || {};
    const data = await supportTicketService.create(req.userId, { category, subject, message });
    success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create };
