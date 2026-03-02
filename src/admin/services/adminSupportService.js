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

let ticketCounter = 0;

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

  return tickets.map((t) => mapTicketToResponse(t, notesByTicket[t._id.toString()] || []));
}

async function getTicketById(id) {
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
  const doc = await AdminSupportTicket.findByIdAndUpdate(
    ticketId,
    { $set: { assignedTo: agentId, assignedToName: name, status: 'in_progress' } },
    { new: true }
  ).populate('assignedTo', 'name email').lean();
  if (!doc) return null;

  await AdminSupportTicketNote.create({
    ticketId: doc._id,
    authorId: agentId,
    authorName,
    type: 'assignment',
    content: `Ticket assigned to ${name}`,
    isInternal: true,
  });

  const notes = await AdminSupportTicketNote.find({ ticketId: doc._id }).sort({ createdAt: 1 }).lean();
  return mapTicketToResponse(doc, notes);
}

async function addTicketNote(ticketId, noteData) {
  const doc = await AdminSupportTicketNote.create({
    ticketId: new mongoose.Types.ObjectId(ticketId),
    authorId: noteData.authorId,
    authorName: noteData.authorName,
    type: noteData.type || 'agent_reply',
    content: noteData.content,
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

async function closeTicket(ticketId) {
  return updateTicket(ticketId, { status: 'closed', resolvedAt: new Date() });
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
  return [];
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
  listFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  listFeedback,
};
