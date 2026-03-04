/**
 * Customer Support controller – create tickets and messages from customer app.
 * Uses auth middleware; injects customer info from req.user.
 */
const mongoose = require('mongoose');
const adminSupportService = require('../../admin/services/adminSupportService');
const { AdminSupportTicket, AdminSupportTicketNote } = require('../../admin/models/AdminSupportTicket');

async function createTicket(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const profile = req.user?.profile;
    const customerName = profile?.name || 'Customer';
    const customerEmail = profile?.phoneNumber ? `customer-${profile.phoneNumber}@selorg.com` : `customer-${userId}@selorg.com`;
    const customerPhone = profile?.phoneNumber || '';

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

    const data = {
      subject: (subject || 'General Chat Support').trim(),
      description: (description || req.body.message || subject || 'General inquiry').trim(),
      category: category || (type === 'general_inquiry' ? 'account' : 'order'),
      priority: priority || 'medium',
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail).trim(),
      customerPhone: String(customerPhone).trim(),
      customerId: String(userId),
      orderNumber: resolvedOrderNumber ? String(resolvedOrderNumber).trim() : undefined,
      channel: 'customer_app',
    };

    const ticket = await adminSupportService.createTicket(data, 'system', 'Customer');
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
    if (ticket.customerId !== String(userId)) {
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
    if (ticket.customerId !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const content = req.body.message || req.body.text || req.body.content || '';
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    const profile = req.user?.profile;
    const customerName = profile?.name || 'Customer';

    const note = await adminSupportService.addTicketNote(ticketId, {
      authorId: String(userId),
      authorName: customerName,
      type: 'customer_reply',
      content: String(content).trim(),
      isInternal: false,
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
  createTicket,
  getTicketMessages,
  sendMessage,
};
