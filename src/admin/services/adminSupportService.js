/**
 * Admin Support Center service – tickets, notes, categories, canned responses, FAQ, feedback.
 */
const mongoose = require('mongoose');
const { AdminSupportTicket, AdminSupportTicketNote } = require('../models/AdminSupportTicket');
const AdminSupportCategory = require('../models/AdminSupportCategory');
const AdminSupportCannedResponse = require('../models/AdminSupportCannedResponse');
const AdminSupportFAQ = require('../models/AdminSupportFAQ');
const AdminSupportFeedback = require('../models/AdminSupportFeedback');
const User = require('../../vendor/models/User');
const PickerSupportTicket = require('../../picker/models/supportTicket.model');
const PickerUser = require('../../picker/models/user.model');
const { Escalation } = require('../../common-models/Escalation');
const RefundRequest = require('../../finance/models/RefundRequest');
const { Order } = require('../../customer-backend/models/Order');
const dispatchService = require('../../rider/services/dispatchService');

let ticketCounter = 0;

function isPickerTicketId(id) {
  return id && String(id).startsWith('picker-support-');
}

function getPickerTicketRawId(id) {
  return String(id).replace(/^picker-support-/, '');
}

function makeServiceError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapCategoryToEscalationType(category) {
  const map = {
    order: 'customer_complaint',
    payment: 'refund_dispute',
    delivery: 'delivery_failed',
    account: 'other',
    technical: 'other',
    feedback: 'customer_complaint',
  };
  return map[String(category || '').toLowerCase()] || 'other';
}

async function resolveAgentObjectId(agent = {}) {
  const candidates = [agent.agentId, agent.userId, agent.id].filter(Boolean);
  for (const id of candidates) {
    if (mongoose.Types.ObjectId.isValid(String(id))) {
      return new mongoose.Types.ObjectId(String(id));
    }
  }
  if (agent.email) {
    const user = await User.findOne({ email: String(agent.email).toLowerCase() }).select('_id').lean();
    if (user?._id) return user._id;
  }
  const adminUser = await User.findOne({ role: { $in: ['admin', 'super_admin'] } }).select('_id').lean();
  if (adminUser?._id) return adminUser._id;
  throw makeServiceError('Could not resolve admin user for this action');
}

async function resolveOrderForTicket(ticketId, mappedTicket, payload = {}) {
  const orderNumberFromPayload = String(payload.orderNumber || '').trim();

  if (isPickerTicketId(ticketId)) {
    const rawId = getPickerTicketRawId(ticketId);
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      const pickerDoc = await PickerSupportTicket.findById(rawId).select('orderNumber').lean();
      const orderNumber =
        orderNumberFromPayload || pickerDoc?.orderNumber || mappedTicket?.orderNumber || '';
      if (orderNumber) {
        return Order.findOne({ orderNumber }).lean();
      }
    }
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(ticketId)) {
    const doc = await AdminSupportTicket.findById(ticketId).select('orderId orderNumber').lean();
    if (doc?.orderId) {
      const byId = await Order.findById(doc.orderId).lean();
      if (byId) return byId;
    }
    const orderNumber = orderNumberFromPayload || doc?.orderNumber || mappedTicket?.orderNumber || '';
    if (orderNumber) {
      return Order.findOne({ orderNumber }).lean();
    }
  }

  if (orderNumberFromPayload) {
    return Order.findOne({ orderNumber: orderNumberFromPayload }).lean();
  }
  if (mappedTicket?.orderNumber) {
    return Order.findOne({ orderNumber: mappedTicket.orderNumber }).lean();
  }
  return null;
}

async function persistPickerOrderNumber(ticketId, orderNumber) {
  if (!isPickerTicketId(ticketId) || !orderNumber) return;
  const rawId = getPickerTicketRawId(ticketId);
  if (!mongoose.Types.ObjectId.isValid(rawId)) return;
  await PickerSupportTicket.findByIdAndUpdate(rawId, { $set: { orderNumber } });
}

function mapPickerCategoryToAdmin(cat) {
  const c = String(cat || '').toLowerCase();
  if (c.includes('payment') || c.includes('salary')) return 'payment';
  if (c.includes('shift')) return 'delivery';
  if (c.includes('document')) return 'account';
  if (c.includes('inventory') || c.includes('device') || c.includes('app')) return 'technical';
  return 'feedback';
}

function mapPickerSupportTicketToAdmin(t, user) {
  const status = t.status === 'resolved' ? 'resolved' : t.status === 'in_progress' ? 'in_progress' : 'open';
  const category = mapPickerCategoryToAdmin(t.category);
  const ticketId = `picker-support-${t._id}`;
  const notes = [];
  if (t.message) {
    notes.push({
      id: `picker-initial-${t._id}`,
      ticketId,
      authorId: String(t.userId),
      authorName: user?.name || 'Picker',
      type: 'customer_reply',
      content: t.message,
      createdAt: t.createdAt,
      isInternal: false,
    });
  }
  (t.replies || []).forEach((r, idx) => {
    notes.push({
      id: r._id ? String(r._id) : `picker-reply-${t._id}-${idx}`,
      ticketId,
      authorId: r.authorId,
      authorName: r.authorName,
      type: r.type || 'agent_reply',
      content: r.content,
      createdAt: r.createdAt,
      isInternal: r.isInternal || false,
    });
  });
  return {
    id: ticketId,
    ticketNumber: `PCK-${String(t._id).slice(-8).toUpperCase()}`,
    subject: t.subject || t.category || 'Picker support',
    description: t.message || '',
    category,
    priority: 'medium',
    status,
    channel: 'in_app',
    customerName: user?.name || 'Picker',
    customerEmail: user?.phone ? `${String(user.phone).replace(/\s/g, '')}@picker.local` : 'picker@local',
    customerPhone: user?.phone || '',
    customerId: String(t.userId),
    assignedTo: t.assignedTo || undefined,
    assignedToName: t.assignedToName || undefined,
    orderNumber: t.orderNumber || undefined,
    tags: ['picker_app', t.category].filter(Boolean),
    responseTime: undefined,
    resolutionTime: undefined,
    slaBreached: false,
    rating: undefined,
    resolvedAt: undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    notes,
  };
}

async function getNextTicketNumber() {
  const last = await AdminSupportTicket.findOne().sort({ createdAt: -1 }).select('ticketNumber').lean();
  if (last && last.ticketNumber && last.ticketNumber.startsWith('TKT-')) {
    const num = parseInt(last.ticketNumber.replace('TKT-', ''), 10);
    ticketCounter = isNaN(num) ? 0 : num;
  }
  ticketCounter += 1;
  return `TKT-${String(ticketCounter).padStart(5, '0')}`;
}

function mapTicketToResponse(doc, notes = []) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    ticketNumber: d.ticketNumber,
    subject: d.subject,
    description: d.description || '',
    category: d.category || 'order',
    priority: d.priority || 'medium',
    status: d.status || 'open',
    channel: d.channel || 'in_app',
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    customerPhone: d.customerPhone || '',
    customerId: d.customerId || '',
    assignedTo: d.assignedTo?.toString(),
    assignedToName: d.assignedToName || d.assignedTo?.name,
    orderNumber: d.orderNumber,
    tags: d.tags || [],
    responseTime: d.responseTime,
    resolutionTime: d.resolutionTime,
    slaBreached: d.slaBreached || false,
    rating: d.rating,
    resolvedAt: d.resolvedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    notes: notes.map((n) => ({
      id: n._id.toString(),
      ticketId: n.ticketId?.toString(),
      authorId: n.authorId,
      authorName: n.authorName,
      type: n.type,
      content: n.content,
      createdAt: n.createdAt,
      isInternal: n.isInternal || false,
    })),
  };
}

async function listTickets(filters = {}) {
  const query = {};
  if (filters.status && filters.status !== 'all') query.status = filters.status;
  if (filters.priority && filters.priority !== 'all') query.priority = filters.priority;
  if (filters.category && filters.category !== 'all') query.category = filters.category;
  if (filters.assignedTo && filters.assignedTo !== 'all') query.assignedTo = filters.assignedTo;
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { ticketNumber: { $regex: s, $options: 'i' } },
      { subject: { $regex: s, $options: 'i' } },
      { customerName: { $regex: s, $options: 'i' } },
      { customerEmail: { $regex: s, $options: 'i' } },
    ];
  }

  const tickets = await AdminSupportTicket.find(query)
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  const ticketIds = tickets.map((t) => t._id);
  const notesByTicket = {};
  if (ticketIds.length > 0) {
    const notes = await AdminSupportTicketNote.find({ ticketId: { $in: ticketIds } }).lean();
    notes.forEach((n) => {
      const tid = n.ticketId?.toString();
      if (!notesByTicket[tid]) notesByTicket[tid] = [];
      notesByTicket[tid].push(n);
    });
  }

  const adminMapped = tickets.map((t) => mapTicketToResponse(t, notesByTicket[t._id.toString()] || []));

  let pickerMapped = [];
  try {
    const ptQuery = {};
    if (filters.status && filters.status !== 'all' && ['open', 'in_progress', 'resolved'].includes(filters.status)) {
      ptQuery.status = filters.status;
    }
    const pickerTickets = await PickerSupportTicket.find(ptQuery).sort({ createdAt: -1 }).limit(200).lean();
    const uids = [...new Set(pickerTickets.map((x) => x.userId).filter(Boolean))];
    const pickerUsers = await PickerUser.find({ _id: { $in: uids } }).select('name phone').lean();
    const um = Object.fromEntries(pickerUsers.map((u) => [String(u._id), u]));
    pickerMapped = pickerTickets.map((t) => mapPickerSupportTicketToAdmin(t, um[String(t.userId)]));
    if (filters.category && filters.category !== 'all') {
      pickerMapped = pickerMapped.filter((x) => x.category === filters.category);
    }
    if (filters.search && filters.search.trim()) {
      const s = filters.search.trim().toLowerCase();
      pickerMapped = pickerMapped.filter(
        (x) =>
          (x.subject && x.subject.toLowerCase().includes(s)) ||
          (x.description && x.description.toLowerCase().includes(s)) ||
          (x.customerName && x.customerName.toLowerCase().includes(s)) ||
          (x.customerPhone && String(x.customerPhone).toLowerCase().includes(s))
      );
    }
  } catch (e) {
    console.warn('[adminSupport] merge picker support tickets:', e?.message);
  }

  const combined = [...pickerMapped, ...adminMapped];
  combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return combined;
}

async function getTicketById(id) {
  if (id && String(id).startsWith('picker-support-')) {
    const rawId = String(id).replace(/^picker-support-/, '');
    if (!mongoose.Types.ObjectId.isValid(rawId)) return null;
    const t = await PickerSupportTicket.findById(rawId).lean();
    if (!t) return null;
    const user = await PickerUser.findById(t.userId).select('name phone').lean();
    return mapPickerSupportTicketToAdmin(t, user);
  }
  const ticket = await AdminSupportTicket.findById(id).populate('assignedTo', 'name email').lean();
  if (!ticket) return null;
  const notes = await AdminSupportTicketNote.find({ ticketId: ticket._id }).sort({ createdAt: 1 }).lean();
  return mapTicketToResponse(ticket, notes);
}

async function createTicket(data, agentId, agentName) {
  const ticketNumber = await getNextTicketNumber();
  const doc = await AdminSupportTicket.create({
    ticketNumber,
    subject: data.subject || 'Untitled',
    description: data.description || '',
    category: data.category || 'order',
    priority: data.priority || 'medium',
    status: 'open',
    channel: data.channel || 'in_app',
    customerId: data.customerId,
    customerName: data.customerName || 'Unknown',
    customerEmail: data.customerEmail || 'unknown@email.com',
    customerPhone: data.customerPhone || '',
    orderNumber: data.orderNumber,
    tags: data.tags || [],
  });

  const note = await AdminSupportTicketNote.create({
    ticketId: doc._id,
    authorId: agentId,
    authorName: agentName,
    type: 'customer_reply',
    content: data.description || data.subject,
    isInternal: false,
  });

  return mapTicketToResponse(doc.toObject(), [note]);
}

async function updateTicket(id, data) {
  if (isPickerTicketId(id)) {
    const rawId = getPickerTicketRawId(id);
    if (!mongoose.Types.ObjectId.isValid(rawId)) return null;
    const pickerUpdate = {};
    if (data.status) {
      pickerUpdate.status =
        data.status === 'closed' || data.status === 'resolved' ? 'resolved' : data.status;
    }
    const doc = await PickerSupportTicket.findByIdAndUpdate(
      rawId,
      { $set: pickerUpdate },
      { new: true }
    ).lean();
    if (!doc) return null;
    const user = await PickerUser.findById(doc.userId).select('name phone').lean();
    return mapPickerSupportTicketToAdmin(doc, user);
  }

  const doc = await AdminSupportTicket.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true }
  ).populate('assignedTo', 'name email').lean();
  if (!doc) return null;
  if (data.status === 'resolved' || data.status === 'closed') {
    await AdminSupportTicket.findByIdAndUpdate(id, { $set: { resolvedAt: new Date() } });
  }
  const notes = await AdminSupportTicketNote.find({ ticketId: doc._id }).sort({ createdAt: 1 }).lean();
  return mapTicketToResponse(doc, notes);
}

async function assignTicket(ticketId, agentId, agentName) {
  const user = await User.findById(agentId).select('name email').lean();
  const name = agentName || user?.name || 'Unknown';

  if (isPickerTicketId(ticketId)) {
    const rawId = getPickerTicketRawId(ticketId);
    if (!mongoose.Types.ObjectId.isValid(rawId)) return null;
    const doc = await PickerSupportTicket.findByIdAndUpdate(
      rawId,
      { $set: { assignedTo: String(agentId), assignedToName: name, status: 'in_progress' } },
      { new: true }
    ).lean();
    if (!doc) return null;
    await addTicketNote(ticketId, {
      authorId: String(agentId),
      authorName: name,
      type: 'internal_note',
      content: `Ticket assigned to ${name}`,
      isInternal: true,
    });
    return getTicketById(ticketId);
  }

  const doc = await AdminSupportTicket.findByIdAndUpdate(
    ticketId,
    { $set: { assignedTo: agentId, assignedToName: name, status: 'in_progress' } },
    { new: true }
  )
    .populate('assignedTo', 'name email')
    .lean();
  if (!doc) return null;

  await AdminSupportTicketNote.create({
    ticketId: doc._id,
    authorId: agentId,
    authorName: name,
    type: 'assignment',
    content: `Ticket assigned to ${name}`,
    isInternal: true,
  });

  const notes = await AdminSupportTicketNote.find({ ticketId: doc._id }).sort({ createdAt: 1 }).lean();
  return mapTicketToResponse(doc, notes);
}

async function addTicketNote(ticketId, noteData) {
  const content = String(noteData.content || '').trim();
  if (!content) {
    const err = new Error('Note content is required');
    err.status = 400;
    throw err;
  }

  if (isPickerTicketId(ticketId)) {
    const rawId = getPickerTicketRawId(ticketId);
    if (!mongoose.Types.ObjectId.isValid(rawId)) {
      const err = new Error('Invalid ticket id');
      err.status = 400;
      throw err;
    }
    const doc = await PickerSupportTicket.findByIdAndUpdate(
      rawId,
      {
        $push: {
          replies: {
            authorId: noteData.authorId,
            authorName: noteData.authorName,
            type: noteData.type || 'agent_reply',
            content,
            isInternal: noteData.isInternal || false,
          },
        },
        $set: { status: 'in_progress' },
      },
      { new: true }
    ).lean();
    if (!doc) {
      const err = new Error('Ticket not found');
      err.status = 404;
      throw err;
    }
    const lastReply = doc.replies[doc.replies.length - 1];
    return {
      id: lastReply._id ? String(lastReply._id) : `picker-reply-${doc._id}-${doc.replies.length - 1}`,
      ticketId: `picker-support-${doc._id}`,
      authorId: lastReply.authorId,
      authorName: lastReply.authorName,
      type: lastReply.type,
      content: lastReply.content,
      createdAt: lastReply.createdAt,
      isInternal: lastReply.isInternal || false,
    };
  }

  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const err = new Error('Invalid ticket id');
    err.status = 400;
    throw err;
  }

  const ticketExists = await AdminSupportTicket.findById(ticketId).select('_id').lean();
  if (!ticketExists) {
    const err = new Error('Ticket not found');
    err.status = 404;
    throw err;
  }

  const doc = await AdminSupportTicketNote.create({
    ticketId: new mongoose.Types.ObjectId(ticketId),
    authorId: noteData.authorId,
    authorName: noteData.authorName,
    type: noteData.type || 'agent_reply',
    content,
    isInternal: noteData.isInternal || false,
  });
  return {
    id: doc._id.toString(),
    ticketId: doc.ticketId.toString(),
    authorId: doc.authorId,
    authorName: doc.authorName,
    type: doc.type,
    content: doc.content,
    createdAt: doc.createdAt,
    isInternal: doc.isInternal,
  };
}

async function closeTicket(ticketId, agent = {}) {
  const agentId = String(agent.agentId || 'admin');
  const agentName = String(agent.agentName || 'Admin');
  const closedAt = new Date();

  if (isPickerTicketId(ticketId)) {
    const rawId = getPickerTicketRawId(ticketId);
    if (!mongoose.Types.ObjectId.isValid(rawId)) return null;
    const doc = await PickerSupportTicket.findByIdAndUpdate(
      rawId,
      {
        $set: { status: 'resolved' },
        $push: {
          replies: {
            authorId: agentId,
            authorName: agentName,
            type: 'agent_reply',
            content: 'Ticket closed by admin',
            isInternal: true,
          },
        },
      },
      { new: true }
    ).lean();
    if (!doc) return null;
    const user = await PickerUser.findById(doc.userId).select('name phone').lean();
    return mapPickerSupportTicketToAdmin(doc, user);
  }

  if (!mongoose.Types.ObjectId.isValid(ticketId)) return null;

  const ticket = await AdminSupportTicket.findById(ticketId).select('_id status').lean();
  if (!ticket) return null;

  if (ticket.status !== 'closed') {
    await AdminSupportTicketNote.create({
      ticketId: ticket._id,
      authorId: agentId,
      authorName: agentName,
      type: 'status_change',
      content: 'Ticket closed',
      isInternal: true,
    });
  }

  const doc = await AdminSupportTicket.findByIdAndUpdate(
    ticketId,
    { $set: { status: 'closed', resolvedAt: closedAt } },
    { new: true }
  )
    .populate('assignedTo', 'name email')
    .lean();
  if (!doc) return null;

  const notes = await AdminSupportTicketNote.find({ ticketId: doc._id }).sort({ createdAt: 1 }).lean();
  return mapTicketToResponse(doc, notes);
}

async function listAgents() {
  const users = await User.find({ $or: [{ role: 'admin' }, { role: 'super_admin' }] })
    .select('name email')
    .lean();
  return users.map((u, i) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    avatar: (u.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
    role: i === 0 ? 'team_lead' : 'agent',
    isOnline: true,
    activeTickets: 0,
    totalResolved: 0,
    avgResolutionTime: 30,
    satisfactionScore: 4.5,
    maxTicketCapacity: 15,
  }));
}

async function listCategories() {
  const ticketCounts = await AdminSupportTicket.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(ticketCounts.map((c) => [c._id, c.count]));

  const defaults = [
    { key: 'order', name: 'Order Issues', description: 'Problems with orders, items, quantities', icon: 'ShoppingBag', slaTarget: 60 },
    { key: 'payment', name: 'Payment & Refunds', description: 'Payment failures, refunds, charges', icon: 'CreditCard', slaTarget: 120 },
    { key: 'delivery', name: 'Delivery', description: 'Delivery delays, wrong address, tracking', icon: 'Truck', slaTarget: 30 },
    { key: 'account', name: 'Account', description: 'Login issues, profile updates', icon: 'User', slaTarget: 45 },
    { key: 'technical', name: 'Technical', description: 'App crashes, bugs', icon: 'AlertCircle', slaTarget: 180 },
    { key: 'feedback', name: 'Feedback', description: 'Customer feedback, suggestions', icon: 'MessageSquare', slaTarget: 1440 },
  ];

  return defaults.map((d, i) => ({
    id: `cat-${i + 1}`,
    name: d.name,
    description: d.description,
    icon: d.icon,
    ticketCount: counts[d.key] || 0,
    avgResolutionTime: 35,
    slaTarget: d.slaTarget,
  }));
}

async function listCannedResponses() {
  const list = await AdminSupportCannedResponse.find().sort({ usageCount: -1 }).lean();
  if (list.length > 0) {
    return list.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      category: c.category,
      content: c.content,
      tags: c.tags || [],
      usageCount: c.usageCount || 0,
      createdBy: c.createdBy,
      lastUsed: c.updatedAt,
    }));
  }
  return [];
}

async function getSLAMetrics() {
  const [total, open, resolved, withinSLA] = await Promise.all([
    AdminSupportTicket.countDocuments(),
    AdminSupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    AdminSupportTicket.countDocuments({ status: { $in: ['resolved', 'closed'] } }),
    AdminSupportTicket.countDocuments({ slaBreached: false }),
  ]);
  return {
    totalTickets: total,
    withinSLA: withinSLA,
    breachedSLA: total - withinSLA,
    openTickets: open,
    resolvedTickets: resolved,
    avgResponseTime: 18,
    avgResolutionTime: 42,
    firstResponseSLA: 30,
    resolutionSLA: 120,
  };
}

async function listLiveChats() {
  const tickets = await AdminSupportTicket.find({
    channel: 'chat',
    status: { $in: ['open', 'in_progress'] },
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  if (!tickets.length) return [];

  const ticketIds = tickets.map((t) => t._id);
  const notes = await AdminSupportTicketNote.find({ ticketId: { $in: ticketIds } })
    .sort({ createdAt: 1 })
    .lean();
  const notesByTicket = {};
  notes.forEach((n) => {
    const key = String(n.ticketId);
    if (!notesByTicket[key]) notesByTicket[key] = [];
    notesByTicket[key].push(n);
  });

  return tickets.map((ticket) => {
    const ticketNotes = notesByTicket[String(ticket._id)] || [];
    const startedAt = ticket.createdAt || new Date().toISOString();
    return {
      id: String(ticket._id),
      customerId: ticket.customerId || '',
      customerName: ticket.customerName || 'Customer',
      agentId: ticket.assignedTo ? String(ticket.assignedTo) : undefined,
      agentName: ticket.assignedToName || undefined,
      status: ticket.status === 'in_progress' ? 'active' : 'waiting',
      startedAt,
      endedAt: ticket.status === 'closed' ? ticket.updatedAt : undefined,
      waitTime: Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
      messages: ticketNotes.map((n) => ({
        id: String(n._id),
        chatId: String(ticket._id),
        senderId: n.authorId || '',
        senderName: n.authorName || 'Unknown',
        senderType: n.type === 'customer_reply' ? 'customer' : 'agent',
        message: n.content || '',
        timestamp: n.createdAt,
        isRead: true,
      })),
    };
  });
}

async function acceptLiveChat(ticketId, agentId, agentName) {
  const updated = await assignTicket(ticketId, agentId, agentName);
  if (!updated) return null;
  return updated;
}

async function sendLiveChatMessage(ticketId, message, sender = {}) {
  const msg = String(message || '').trim();
  if (!msg) {
    const err = new Error('message is required');
    err.status = 400;
    throw err;
  }
  const authorId = String(sender.senderId || sender.authorId || 'agent');
  const authorName = String(sender.senderName || sender.authorName || 'Agent');
  const senderType = String(sender.senderType || 'agent');
  const type = senderType === 'customer' ? 'customer_reply' : 'agent_reply';

  const note = await addTicketNote(ticketId, {
    authorId,
    authorName,
    type,
    content: msg,
    isInternal: false,
  });
  await AdminSupportTicket.findByIdAndUpdate(ticketId, {
    $set: {
      status: 'in_progress',
      updatedAt: new Date(),
    },
  });
  return note;
}

async function listFAQs() {
  const list = await AdminSupportFAQ.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  return list.map((f) => ({
    id: f._id.toString(),
    question: f.question,
    answer: f.answer,
    category: f.category,
    keywords: f.keywords || [],
    sortOrder: f.sortOrder,
    isActive: f.isActive,
  }));
}

async function createFAQ(data) {
  const doc = await AdminSupportFAQ.create(data);
  return { id: doc._id.toString(), ...doc.toObject() };
}

async function updateFAQ(id, data) {
  const doc = await AdminSupportFAQ.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  return doc ? { id: doc._id.toString(), ...doc } : null;
}

async function deleteFAQ(id) {
  await AdminSupportFAQ.findByIdAndDelete(id);
  return true;
}

async function listFeedback() {
  const list = await AdminSupportFeedback.find().sort({ createdAt: -1 }).limit(100).lean();
  return list.map((f) => ({
    id: f._id.toString(),
    customerId: f.customerId,
    customerName: f.customerName,
    sentiment: f.sentiment,
    productOrCategory: f.productOrCategory,
    content: f.content,
    ticketId: f.ticketId?.toString(),
    rating: f.rating,
    createdAt: f.createdAt,
  }));
}

async function escalateTicket(ticketId, payload = {}, agent = {}) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return null;

  const targetTeam = payload.targetTeam === 'rider_ops' ? 'rider_ops' : 'darkstore';
  const description = String(
    payload.description || payload.notes || ticket.description || ticket.subject || ''
  ).trim();
  if (!description) throw makeServiceError('Escalation description is required');

  const agentId = String(agent.agentId || '');
  const createdBy = await resolveAgentObjectId(agent);

  const order = await resolveOrderForTicket(ticketId, ticket, payload);
  const escalationPayload = {
    targetTeam,
    type: mapCategoryToEscalationType(ticket.category),
    description,
    priority:
      ticket.priority === 'urgent' ? 'critical' : ticket.priority === 'high' ? 'high' : 'medium',
    status: 'open',
    createdBy,
    orderId: order?._id || undefined,
    customerId:
      ticket.customerId && mongoose.Types.ObjectId.isValid(ticket.customerId)
        ? new mongoose.Types.ObjectId(ticket.customerId)
        : undefined,
  };

  if (!isPickerTicketId(ticketId) && mongoose.Types.ObjectId.isValid(ticketId)) {
    escalationPayload.ticketId = new mongoose.Types.ObjectId(ticketId);
  }

  const escalation = await Escalation.create(escalationPayload);
  const teamLabel = targetTeam === 'darkstore' ? 'Store' : 'Rider Ops';

  await addTicketNote(ticketId, {
    authorId: agentId,
    authorName: String(agent.agentName || 'Admin'),
    type: 'internal_note',
    content: `Escalated to ${teamLabel}: ${description}`,
    isInternal: true,
  });

  if (isPickerTicketId(ticketId)) {
    const rawId = getPickerTicketRawId(ticketId);
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      await PickerSupportTicket.findByIdAndUpdate(rawId, {
        $set: { escalatedTo: targetTeam, status: 'in_progress' },
      });
    }
  } else {
    await AdminSupportTicket.findByIdAndUpdate(ticketId, {
      $set: {
        escalatedTo: targetTeam,
        escalationType: escalationPayload.type,
        escalationId: escalation._id,
        status: 'in_progress',
      },
    });
  }

  return getTicketById(ticketId);
}

async function triggerRefund(ticketId, payload = {}, agent = {}) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return null;

  const orderNumberInput = String(payload.orderNumber || '').trim();
  if (orderNumberInput) {
    await persistPickerOrderNumber(ticketId, orderNumberInput);
  }

  const order = await resolveOrderForTicket(ticketId, ticket, payload);
  if (!order) {
    throw makeServiceError(
      isPickerTicketId(ticketId)
        ? 'Enter a valid customer order number to trigger a refund'
        : 'Link an order to this ticket before triggering a refund'
    );
  }

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw makeServiceError('Valid refund amount is required');
  }

  const reasonText = String(
    payload.reasonText || payload.reason || 'Triggered from support ticket'
  ).trim();
  const validReasons = [
    'item_damaged',
    'expired',
    'late_delivery',
    'wrong_item',
    'customer_cancelled',
    'item_not_available',
    'quality_issue',
    'partial_delivery',
    'other',
  ];
  const reasonCode = validReasons.includes(payload.reasonCode) ? payload.reasonCode : 'other';

  const refund = await RefundRequest.create({
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    customerId: String(order.userId),
    customerName: ticket.customerName || 'Customer',
    customerEmail: ticket.customerEmail || '',
    customerPhone: ticket.customerPhone || '',
    reasonCode,
    reasonText,
    amount,
    currency: 'INR',
    status: 'pending',
    channel: 'customer_support',
    ticketId:
      !isPickerTicketId(ticketId) && mongoose.Types.ObjectId.isValid(ticketId)
        ? new mongoose.Types.ObjectId(ticketId)
        : undefined,
    timeline: [
      {
        status: 'pending',
        timestamp: new Date(),
        actor: String(agent.agentName || 'Admin'),
        note: reasonText,
      },
    ],
  });

  if (!isPickerTicketId(ticketId)) {
    await AdminSupportTicket.findByIdAndUpdate(ticketId, {
      $set: { linkedRefundId: refund._id, status: 'in_progress' },
    });
  } else {
    const rawId = getPickerTicketRawId(ticketId);
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      await PickerSupportTicket.findByIdAndUpdate(rawId, {
        $set: { orderNumber: order.orderNumber, status: 'in_progress' },
      });
    }
  }

  await addTicketNote(ticketId, {
    authorId: String(agent.agentId || 'admin'),
    authorName: String(agent.agentName || 'Admin'),
    type: 'internal_note',
    content: `Refund requested: ₹${amount.toFixed(2)} — ${reasonText}`,
    isInternal: true,
  });

  const updatedTicket = await getTicketById(ticketId);
  return {
    ticket: updatedTicket,
    refund: {
      id: refund._id.toString(),
      amount: refund.amount,
      status: refund.status,
      orderNumber: refund.orderNumber,
    },
  };
}

async function triggerRedelivery(ticketId, payload = {}, agent = {}) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return null;

  const orderNumberInput = String(payload.orderNumber || '').trim();
  if (orderNumberInput) {
    await persistPickerOrderNumber(ticketId, orderNumberInput);
  }

  const order = await resolveOrderForTicket(ticketId, ticket, payload);
  if (!order) {
    throw makeServiceError(
      isPickerTicketId(ticketId)
        ? 'Enter a valid customer order number to trigger re-delivery'
        : 'Link an order to this ticket before triggering re-delivery'
    );
  }

  const addr = order.deliveryAddress || {};
  const dropLocation = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .join(', ')
    .trim();
  if (!dropLocation) {
    throw makeServiceError('Order has no delivery address for re-delivery');
  }

  let items = (order.items || [])
    .map((i) => i.productName || i.name)
    .filter(Boolean);
  if (items.length === 0) {
    items = ['Re-delivery items'];
  }

  const notes =
    String(payload.notes || '').trim() ||
    `Re-delivery from support ticket ${ticket.ticketNumber}`;

  const dispatch = await dispatchService.createManualOrder({
    orderType: 'standard',
    items,
    dropLocation,
    customerName: ticket.customerName || 'Customer',
    customerPhone: ticket.customerPhone || '',
    pickupLocation: 'Store',
  });

  if (isPickerTicketId(ticketId)) {
    const rawId = getPickerTicketRawId(ticketId);
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      await PickerSupportTicket.findByIdAndUpdate(rawId, {
        $set: { orderNumber: order.orderNumber, status: 'in_progress' },
      });
    }
  } else {
    await AdminSupportTicket.findByIdAndUpdate(ticketId, {
      $set: { status: 'in_progress' },
    });
  }

  await addTicketNote(ticketId, {
    authorId: String(agent.agentId || 'admin'),
    authorName: String(agent.agentName || 'Admin'),
    type: 'internal_note',
    content: `${notes} (Dispatch order: ${dispatch.orderId})`,
    isInternal: true,
  });

  const updatedTicket = await getTicketById(ticketId);
  return {
    ticket: updatedTicket,
    dispatch,
  };
}

module.exports = {
  listTickets,
  getTicketById,
  createTicket,
  updateTicket,
  assignTicket,
  addTicketNote,
  closeTicket,
  listAgents,
  listCategories,
  listCannedResponses,
  getSLAMetrics,
  listLiveChats,
  acceptLiveChat,
  sendLiveChatMessage,
  listFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  listFeedback,
  escalateTicket,
  triggerRefund,
  triggerRedelivery,
};
