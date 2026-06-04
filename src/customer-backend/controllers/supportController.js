/**
 * Customer Support controller – create tickets and messages from customer app.
 * Uses auth middleware; injects customer info from req.user.
 */
const mongoose = require('mongoose');
const adminSupportService = require('../../admin/services/adminSupportService');
const { AdminSupportTicket, AdminSupportTicketNote } = require('../../admin/models/AdminSupportTicket');
const { resolveCustomerIdentity } = require('../utils/customerDisplay');

function customerIdentityFromRequest(req, ticket) {
  return resolveCustomerIdentity({ user: req.user?.profile, ticket });
}

function ticketOwnedByUser(ticket, userId) {
  return String(ticket?.customerId || '') === String(userId);
}

function isLiveChatRequest(body = {}) {
  const type = String(body.type || '').trim();
  return (
    body.channel === 'chat' ||
    type === 'general_inquiry' ||
    type === 'order_issue' ||
    body.liveChat === true
  );
}

async function getActiveChatTicket(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const orderNumber = req.query.orderNumber ? String(req.query.orderNumber).trim() : '';
    const filter = {
      customerId: String(userId),
      channel: 'chat',
      status: { $in: ['open', 'in_progress'] },
    };

    if (orderNumber) {
      filter.orderNumber = orderNumber;
    } else {
      filter.$or = [{ orderNumber: { $exists: false } }, { orderNumber: null }, { orderNumber: '' }];
    }

    const ticket = await AdminSupportTicket.findOne(filter).sort({ updatedAt: -1 }).lean();
    if (!ticket) {
      return res.status(200).json({ success: true, data: null });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: ticket._id.toString(),
        _id: ticket._id.toString(),
        subject: ticket.subject,
        orderNumber: ticket.orderNumber,
        status: ticket.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function createTicket(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const profile = req.user?.profile;
    const identity = customerIdentityFromRequest(req);
    const customerName =
      (req.body.customerName && String(req.body.customerName).trim()) || identity.customerName;
    const customerPhone =
      (req.body.customerPhone && String(req.body.customerPhone).trim()) ||
      identity.customerPhone;
    const bodyEmail = req.body.customerEmail && String(req.body.customerEmail).trim();
    const profileEmail = profile?.email && String(profile.email).trim();
    const customerEmail =
      bodyEmail ||
      profileEmail ||
      (customerPhone
        ? `customer-${customerPhone.replace(/\D/g, '')}@selorg.com`
        : `customer-${userId}@selorg.com`);

    const {
      subject,
      description,
      category,
      priority,
      orderNumber,
      orderId,
      type,
    } = req.body;

    const resolvedOrderNumber = orderNumber || orderId;

    const liveChat = isLiveChatRequest(req.body);

    const data = {
      subject: (subject || 'General Chat Support').trim(),
      description: liveChat
        ? String(description || req.body.message || '').trim()
        : (description || req.body.message || subject || 'General inquiry').trim(),
      category: category || (type === 'general_inquiry' ? 'account' : 'order'),
      priority: priority || 'medium',
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail).trim(),
      customerPhone: String(customerPhone).trim(),
      customerId: String(userId),
      orderNumber: resolvedOrderNumber ? String(resolvedOrderNumber).trim() : undefined,
      channel: liveChat ? 'chat' : 'in_app',
    };

    const ticket = await adminSupportService.createTicket(data, 'system', 'Support');
    return res.status(201).json({
      success: true,
      data: {
        id: ticket.id,
        _id: ticket.id,
        ...ticket,
      },
    });
  } catch (err) {
    next(err);
  }
}

function mapCustomerTicketSummary(ticket, noteCount = 0) {
  return {
    id: ticket._id.toString(),
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description || '',
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    channel: ticket.channel,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    noteCount,
    canReopen: ticket.status === 'closed' || ticket.status === 'resolved',
  };
}

async function listMyTickets(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const tickets = await AdminSupportTicket.find({
      customerId: String(userId),
      channel: { $ne: 'chat' },
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const ticketIds = tickets.map((t) => t._id);
    const noteCounts = {};
    if (ticketIds.length > 0) {
      const agg = await AdminSupportTicketNote.aggregate([
        { $match: { ticketId: { $in: ticketIds }, isInternal: false } },
        { $group: { _id: '$ticketId', count: { $sum: 1 } } },
      ]);
      agg.forEach((row) => {
        noteCounts[String(row._id)] = row.count;
      });
    }

    return res.status(200).json({
      success: true,
      data: tickets.map((t) =>
        mapCustomerTicketSummary(t, noteCounts[String(t._id)] || 0)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function reopenTicket(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { ticketId } = req.params;
    const ticket = await AdminSupportTicket.findById(ticketId).lean();
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (!ticketOwnedByUser(ticket, userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (!['closed', 'resolved'].includes(ticket.status)) {
      return res.status(400).json({ success: false, error: 'Ticket is already open' });
    }

    await AdminSupportTicket.findByIdAndUpdate(ticketId, {
      $set: { status: 'open', resolvedAt: null },
    });

    const identity = customerIdentityFromRequest(req, ticket);
    await adminSupportService.addTicketNote(ticketId, {
      authorId: String(userId),
      authorName: identity.displayName,
      type: 'customer_reply',
      content: 'Customer reopened this ticket.',
      isInternal: false,
    });

    const updated = await AdminSupportTicket.findById(ticketId).lean();
    return res.status(200).json({
      success: true,
      data: mapCustomerTicketSummary(updated),
    });
  } catch (err) {
    next(err);
  }
}

async function getTicketMessages(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { ticketId } = req.params;
    const ticket = await AdminSupportTicket.findById(ticketId).lean();
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (!ticketOwnedByUser(ticket, userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const notes = await AdminSupportTicketNote.find({
      ticketId: new mongoose.Types.ObjectId(ticketId),
      isInternal: false,
    })
      .sort({ createdAt: 1 })
      .lean();

    const messages = notes.map((n) => ({
      id: n._id.toString(),
      _id: n._id.toString(),
      text: n.content,
      message: n.content,
      sender: n.type === 'customer_reply' ? 'customer' : 'agent',
      authorName: n.authorName,
      timestamp: n.createdAt,
      createdAt: n.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: { messages },
      messages,
    });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { ticketId } = req.params;
    const ticket = await AdminSupportTicket.findById(ticketId).lean();
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (!ticketOwnedByUser(ticket, userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const content = req.body.message || req.body.text || req.body.content || '';
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    const identity = customerIdentityFromRequest(req, ticket);

    const note = await adminSupportService.addTicketNote(ticketId, {
      authorId: String(userId),
      authorName: identity.displayName,
      type: 'customer_reply',
      content: String(content).trim(),
      isInternal: false,
    });

    await AdminSupportTicket.findByIdAndUpdate(ticketId, {
      $set: {
        updatedAt: new Date(),
        status: ticket.status === 'closed' ? 'open' : 'in_progress',
        customerName: identity.customerName,
        customerPhone: identity.customerPhone || ticket.customerPhone || '',
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        id: note.id,
        text: note.content,
        sender: 'customer',
        timestamp: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getActiveChatTicket,
  createTicket,
  listMyTickets,
  reopenTicket,
  getTicketMessages,
  sendMessage,
};
